var express = require('express')
var bodyParser = require('body-parser')
const cors = require('cors');
var parseurl = require('parseurl')
var fs = require('fs');
var http = require('http');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const simpleParser = require('./simple-parser');
const nodemailer = require('nodemailer');
const MailComposer = require("nodemailer/lib/mail-composer");
const newIssueData = require('./jira/apiJira');
const FormData = require('form-data');

const {Duplex} = require('stream'); // Native Node Module
const axios = require('axios');
const request = require('request');

const delay = ms => new Promise(res => setTimeout(res, ms)); 

function makeJiraRequest(method,url,data,oHeaders) {
    return new Promise(function (resolve, reject) {
        let xhr = new XMLHttpRequest();
        xhr.open(method, url);
        if (typeof oHeaders!=="undefined"){
	        for (const headerName in oHeaders){
				xhr.setRequestHeader(headerName, oHeaders[headerName]);	
			}
		}
        
        xhr.onload = function () {
			if (this.status == 429){
				debugger;
				console.log("Max Call Number Limit");
				var retryAfter=xhr.getResponseHeader("Retry-After");
				var limitReset=xhr.getResponseHeader("X-RateLimit-Reset");
				console.log("Retry after "+retryAfter+"secs");
				console.log("Retry after the:"+limitReset);
				resolve({callLimit:true,waitRetry:retryAfter});
			} else if (this.status >= 200 && this.status < 300) {
				debugger;
				if (typeof xhr.response!=="undefined"){
                	resolve(xhr.response);
                } else if (typeof xhr.responseText!=="undefined"){
					var oResp=xhr.responseText;
					if (oResp==""){
						oResp={};
					} else {
						try {
							oResp=JSON.parse(oResp);	
						} catch(error){
							console.log("Respones can´t be parsed");
						}
					}
					resolve(oResp);
				}
                
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
        };
        xhr.onerror = function () {
			debugger;
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
        xhr.send(data);
    });
}
 

var PORT=14280;

var app = express()

 const corsOptions = {
   optionsSuccessStatus: 200
 };

app.use(cors(corsOptions));


var arrPaths=['/config','/sendtojira'];

for (const thePath of arrPaths){
	app.use(thePath,bodyParser.json({limit: '500mb'}) );       // to support JSON-encoded bodies
	app.use(thePath, bodyParser.urlencoded({extended: true,limit: '500mb'})); 
}

app.use('/processissue',function (req, res ,next) {
	req.text = '';
	req.setEncoding('utf8');
	req.on('data', function(chunk){ req.text += chunk });
	req.on('end', next);
})


var params;
var transport;

app.post('/config', async function (req,res) {
	var oConfig=req.body;
	var sParams=oConfig.params;
	params=JSON.parse(atob(sParams));
	transport=nodemailer.createTransport({
	  host: params.smtpServer,
	  port: params.smtpPort,
	  auth: {
	    user: params.smtpUser,
	    pass: params.smtpPassword
	  },
	  secure: true, // use TLS
	  tls: {
	    // do not fail on invalid certs
	    rejectUnauthorized: false,
	  }	  
	});
	res.send(JSON.stringify({"result":"OK"}));
});
function streamToString (stream) {
	  const chunks = [];
	  return new Promise((resolve, reject) => {
 	    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
	    stream.on('error', (err) => reject(err));
	    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
	  })
}
var idMsg=0;
async function processRFC822(sMessage){
	var msgId=(idMsg+1);
	idMsg++;
	var arrProcesses=[];
	var oReturn=await simpleParser(sMessage);
	debugger;
	var msgIDs=["Message-ID","References","In-Reply-To","X-Forwarded-Message-Id"];
	/*
	Message-ID: <89e7244d-21c8-44c7-a20d-c0d8a09e69f8@aragon.es>
References: <feced3f2-ec25-417c-b8d3-c465554796f1@aragon.es>
In-Reply-To: <feced3f2-ec25-417c-b8d3-c465554796f1@aragon.es>
X-Forwarded-Message-Id: <feced3f2-ec25-417c-b8d3-c465554796f1@aragon.es>
	*/
	for (const idHeader of msgIDs){
		var mapName=idHeader.toLocaleLowerCase();
		if (oReturn.headers.has(mapName)){
			oReturn[idHeader]=oReturn.headers.get(mapName);
		} else {
			oReturn[idHeader]="";
		}
	}
	var iAtt=0;
	for (const attch of oReturn.attachments){
		attch.childs=[];
		attch.childNumber=iAtt;
		iAtt++;
	}
	iAtt=0;
	while (iAtt<oReturn.attachments.length){
		var attch=oReturn.attachments[iAtt];
		if (attch.contentType=="message/rfc822"){
			var sSubMail=attch.content.toString();
			var oSubMail=await simpleParser(sSubMail);
			if (attch.filename==""){
				attch.filename=oSubMail.subject+".eml";
			}
			console.log(iAtt+" atachment")
			for (const subAtt of oSubMail.attachments){
				subAtt.childs=[];
				subAtt.parent=attch;
				attch.childs.push(subAtt);
				subAtt.childNumber=(attch.childs.length-1)
				oReturn.attachments.push(subAtt);
			}
            //attch.content= Buffer.from(btoa(sSubMail),'base64');
            attch.content= sSubMail;
            //attch.encoding='base64';
		}
		iAtt++;		 
	} 
	console.log("Finish parsing:"+msgId+" "+ sMessage.length + " attachements:"+oReturn.attachments.length);
	return oReturn;
} 
function getJSON(mail){
	var oJSON={
		to:mail.to,
		from:mail.from,
		cc:mail.cc,
		subject:mail.subject,
		received:"Recibido",
		text:mail.text
	};
	if (mail.from==params.smtpUser){
		oJSON.received="Enviado";
	}
	return oJSON;
}


async function jiraApiCall(method,sPath,data,bSendForm){

	var headers={
		"Authorization":" Basic "+params.jiraToken,
        "Content-Type": "application/json",
		"Accept": "application/json"
	};
	if ((typeof bSendForm!=="undefined")&&(bSendForm)){
		headers["Content-Type"]="multipart/form-data";
	} 
	var oResult={};
	try {
		var sUrl=params.jiraServer+"/rest/api/2"+sPath;
		console.log(sUrl);
		oResult=await makeJiraRequest(method,sUrl,data,headers);
		while (typeof oResult.callLimit!=="undefined"){
			var waitRetry=oResult.waitRetry;
			if (typeof waitRetry=="string"){
				waitRetry=parseFloat(waitRetry);
			}
			console.log("Waiting "+(waitRetry*1000)+" millis");
			await delay(waitRetry*1000);
			console.log("Retrying");
			oResult=await makeJiraRequest(method,sUrl,data,headers);
		}
	} catch (error) {
		debugger; 
		console.log(error);
	}
	return oResult;
}
 
async function loadMail(sMail){
	var oResult={};
	var sMessage=atob(sMail);
	var theMail=await processRFC822(sMessage);
			 
	debugger;
	if (typeof theMail.to!=="undefined") oResult.to=theMail.to.text;
	if (typeof theMail.cc!=="undefined") oResult.cc=theMail.cc.text;
	//oResult.to=params.smtpUser;
	if (typeof theMail.from!=="undefined") oResult.from =theMail.from.text;
	oResult.subject=theMail.subject;
	oResult.html=theMail.textAsHtml;
	oResult.text=theMail.text;
	oResult.date=theMail.date;
	var msgIDs=["Message-ID","References","In-Reply-To","X-Forwarded-Message-Id"];
	oResult.msgFields=msgIDs;
	for (const msgID of msgIDs){
		oResult[msgID]=theMail[msgID];	
	}
	
	oResult.attachments=[];
	var iAttch=theMail.attachments.length-1;
	while (iAttch>=0){
		var attch=theMail.attachments[iAttch];
		var auxAttch=attch;
		var sPath=(auxAttch.childNumber+"").padStart(2,"0");
		while (typeof auxAttch.parent!=="undefined"){
			auxAttch=auxAttch.parent;
			sPath=(auxAttch.childNumber+"").padStart(2,"0")+"-"+sPath;
		}
		attch.filename=sPath + " - " + attch.filename;
		if (attch.contentType=="message/rfc822"){
		 	oResult.attachments.push({
				filename:attch.filename,
		 		contentType: "text/plain",
				content:attch.content
			});
		} else {
			oResult.attachments.push({
				filename:attch.filename,
				contentType: attch.contentType,
				content:attch.content
			});
		} 
		iAttch--;
	}
	oResult.attachments.push({
		filename:"ORIGINAL"+ " - " + theMail.subject+".eml",
		contentType: "text/plain",
		content:sMessage
	});
	/*
	var oJSON=getJSON(theMail);
	oResult.text+="--------- JSON DATA ---------";
	oResult.text+=btoa(JSON.stringify(oJSON));
	oResult.text+="--------- JSON DATA ---------";
	oResult.text+="AUTOMATION PROCESS REQUIRED";
	*/
	return oResult;
	
}


function bufferToStream(myBuffer) {
    let tmp = new Duplex();
    tmp.push(myBuffer);
    tmp.push(null);
    return tmp;
}

async function sendAttachment(issueId,attch){
	const form = new FormData();
	var buffContent=attch.content;
	var fileOptions={filename: attch.filename, contentType: attch.contentType};
/*	if (typeof buffContent=="string"){
		buffContent=Buffer.from(buffContent);
		fileOptions.contentType="application/octet-stream";
	}
*/	
	form.append('file', buffContent, fileOptions);
	
	
	var sUrl=params.jiraServer+"/rest/api/2"+"/issue/"+issueId+"/attachments";
	console.log (JSON.stringify(form.getHeaders()));

/*	var headers=form.getHeaders();
	headers["Authorization"]=" Basic "+params.jiraToken;
*/	 
	debugger;
	try {
		var oResult=await axios({
		    url: sUrl,
		    data: form,
		    method: 'post',
		    maxContentLength: Infinity,
		    maxBodyLength: Infinity,
		    headers: {
		        ...form.getHeaders(), // It seems that this is the key.
		        "Authorization":" Basic "+params.jiraToken,
		        "X-Atlassian-Token": 'no-check'
		    }
		});
		
		while (typeof oResult.headers["Retry-After"]!=="undefined"){
			debugger;
			console.log("Max Call Limits")
			var waitRetry=oResult.headers["Retry-After"];
			var limitReset=oResult.headers["X-RateLimit-Reset"];
			console.log("Retry after "+waitRetry+" secs");
			console.log("Retry after the:"+limitReset);
			if (typeof waitRetry=="string"){
				waitRetry=parseFloat(waitRetry);
			}
			console.log("Waiting "+(waitRetry*1000)+" millis");
			await delay(waitRetry*1000);
			console.log("Retrying");
			oResult=await axios({
					    url: sUrl,
					    data: form,
					    method: 'post',
					    maxContentLength: Infinity,
					    maxBodyLength: Infinity,
					    headers: {
					        ...form.getHeaders(), // It seems that this is the key.
					        "Authorization":" Basic "+params.jiraToken,
					        "X-Atlassian-Token": 'no-check'
					    }
					});
		}
	
	//	var oResult=await makeJiraRequest("POST",sUrl,form,headers);
	//	console.log(JSON.stringify(oResult));
	} catch (error) {
		debugger;
		console.log(error);
	}
	
 	debugger;
}


var mailStorage=[];
var mailByID={};
var nAttachmentsLoaded=0;


app.post('/sendtojira', async function (req,res) {
	var oResult={};
	var oMail=await  loadMail(req.body.message);
	if (typeof mailByID[oMail["Message-ID"]]!=="undefined"){
		console.log("Repetido");
	} else { 
		var oJiraData=newIssueData(oMail,params);
		oMail.jiraData=oJiraData;
		mailStorage.push(oMail);
		nAttachmentsLoaded+=oMail.attachments.length;
		mailByID[oMail["Message-ID"]]=oMail;
		console.log("Total Messages:"+mailStorage.length+" Total Attachments:"+nAttachmentsLoaded);
		/*if (mailStorage.length>12){ //oMail["Message-ID"] =="<f56527fb-760e-abbb-ad2a-26e4121cfdc6@correo.gob.es>"){
			debugger;
			await createIssue(oMail);
		}*/  
	}
	res.send(oResult);
	return;	 
}) 

var nLinks=0;
function linkMails(srcMail,dstRef){
	if (typeof mailByID[dstRef] !=="undefined") {
		var dstMail=mailByID[dstRef];
		if (typeof srcMail["jiralinks"]=="undefined") srcMail["jiralinks"]= {};
		if (typeof dstMail["jiralinks"]=="undefined") dstMail["jiralinks"]= {};
		srcMail.jiralinks[dstMail["Message-ID"]]=dstMail;
		dstMail.jiralinks[srcMail["Message-ID"]]=srcMail;
		nLinks++;
		console.log("nLinked:"+nLinks);
	}
}

async function createIssue(oMail){
	var oData="";
	if (typeof oMail.jiraData!=="undefined"){
		oData =oMail.jiraData;
	} else {
		oData=newIssueData(oMail);	
	}
	debugger;
	oResult = await jiraApiCall("POST","/issue",JSON.stringify(oData));
	debugger;
	var issueId=oResult.key;
	oMail.issueId=issueId;
	for (const attch of oMail.attachments){
		oResult=await sendAttachment(issueId,attch);
	}
	console.log(JSON.stringify(oResult));
}

async function createIssueLink(srcIssueId,dstIssueId){
	const oData = {
	  "inwardIssue": {
	    "key": srcIssueId 
	  },
	  "outwardIssue": {
	    "key": dstIssueId
	  }, 
	  "type": {
	    "name": "Relates"
	  }
	};
	oResult = await jiraApiCall("POST","/issueLink",JSON.stringify(oData));
	console.log(JSON.stringify(oResult));	
}


app.post('/processallissues', async function (req, res,next) {
	var oResult={};
	mailStorage.sort(function(a, b){
		if (a.date<b.date) return -1;
		return 1;
		});
	// relacionar mensajes
	for (const mail of mailStorage){
		for (const ref of mail.References) {
			linkMails(mail,ref);
		} 
		linkMails(mail,mail["X-Forwarded-Message-Id"]);
		linkMails(mail,mail["In-Reply-To"]);
	}
	
	for (const mail of mailStorage){
		await createIssue(mail);
		for (const ref in mail.jiralinks){
			var dstMail=mail.jiralinks[ref];
			if (typeof dstMail.issueId!=="undefined"){
				await createIssueLink(mail.issueId,dstMail.issueId);
			}
		}
	}
		
	res.send(oResult);
	return;
})


/*
app.post('/processissue', async function (req, res,next) {
  debugger;
  var sText=req.text;
  var arrText=sText.split('`<RCG_jiramailer_startdescription>');
  var sPrev=arrText[0];
  
  arrText=arrText[1].split('</RCG_jiramailer_startdescription>`');
  var sDesc=arrText[0];
  var sPost=arrText[1];
  var sText=sPrev+sPost;
  var oJson=JSON.parse(sText);
  oJson.description=sDesc;
  arrText=sDesc.split("--------- JSON DATA ---------");
  var b64Data=arrText[1];
  var sData=atob(b64Data);
  var oJsonData=JSON.parse(sData);
	// code below here will only execute when await makeRequest() finished loading
  res.send(JSON.stringify(oJsonData));
}) 

app.post('/', (req, res) => {
	debugger;
  res.send(JSON.stringify({"result":"/"}));
})
*/

console.log("Lanzando servidor en puerto "+PORT);

http.createServer({
 },app).listen(PORT, function(){
	console.log('Servidor http corriendo en el puerto '+PORT);
});

