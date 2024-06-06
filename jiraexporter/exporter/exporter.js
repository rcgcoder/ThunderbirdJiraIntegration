//import * as modConfig from '../modules/config.mjs';

var params={};

function makeRequest(method, url,data) {
    return new Promise(function (resolve, reject) {
        let xhr = new XMLHttpRequest();
        
        xhr.open(method, url);
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhr.response);
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
        };
        xhr.onerror = function () {
			//debugger;
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
        xhr.send(JSON.stringify(data));
    });
}

async function sendConfig(){
	var bsMsg=JSON.stringify(params);
	var oResPost=await makeRequest("POST",params.nodejsServer+"/config",{action:"config", params:btoa(bsMsg)});
}


async function sendEmail(params) {
	var details={};
	debugger;
	details.subject="Prueba dinamica con parametros ";
	details.cc=params.userMail;
	details.deliveryFormat="html";
	details.to=params.jiraMail;
	var strDetails=JSON.stringify(details);
	var strDetails=btoa(strDetails);
// my mes
	
	var sHTML='{"Sentido":"Entrada"} {{Sentido}} **Cabecera** <br> *cuerpo* '+params.distinctive +" <br> <br>" +strDetails; 
	details.body=sHTML;
	var msg=await messenger.compose.beginNew(undefined,details);
	//debugger;
	console.log(msg);
	await messenger.compose.sendMessage(msg.id,{mode:"sendNow"});
	console.log("mensaje enviado");
}

async function getContentTypes(parts){
	var cTypes={};
	for (const part of parts){
		if (typeof cTypes[part.contentType]=="undefined"){
			cTypes[part.contentType]=0;
		}
		cTypes[part.contentType]++;
		if (typeof part.parts!=="undefined"){
			var auxCTypes=await getContentTypes(part.parts);
			for (const cType in auxCTypes){
				if (typeof cTypes[cType]=="undefined"){
					cTypes[cType]=0;
				} 
				cTypes[cType]+=auxCTypes[cType];
			}
		}
	}
	return cTypes;	
}
var contentTypes={};

function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}
function getByteArray(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

function arrayBufferToBase64( buffer ) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}


var sendingCounter=0;
var oCounters={};
var accumSize=0;

async function processMessages(messages){
	var cTypes=contentTypes;
	var cAttachments=[]; 
	//debugger;
	
	var mails=params.distinctive;
	
	
	for (const message of messages){
		//console.log(message.id);
//		let fullMsg = await messenger.messages.getFull(message.id);
		//console.log(fullMsg.subject);
		var msg={};
//		msg.id=fullMsg.headers["message-id"];
		msg.subject=message.subject; 
		msg.cc=message.ccList;
		msg.date=message.date;
		msg.to=message.recipients;
		msg.from=message.author;
		
		var allDirs="";
		var concatenateDirs=function concatenateDirs(fldName){
			var dirs=msg[fldName];
			if (typeof dirs!=="undefined"){
				allDirs+=";";
				if (typeof dirs=="string"){
					allDirs+=dirs;
				} else if (Array.isArray(dirs)) {
					allDirs+=dirs.join(";");
				}
			}
		}
		concatenateDirs("to");concatenateDirs("from");concatenateDirs("cc");
		
		var bSendToJira=false;
		var iMail=0;
		
		while ((iMail<mails.length) && (!bSendToJira)){
			var mailDir=mails[iMail];
			if (allDirs.indexOf(mailDir)>=0){
				if (typeof oCounters[mailDir]=="undefined"){
					oCounters[mailDir]=0;
				}
				oCounters[mailDir]++;
				sendingCounter++;
				bSendToJira=true;
			}
			iMail++;
		}
		
		if (bSendToJira){
			//debugger;
			console.log(JSON.stringify(oCounters));
			console.log("Total storable:"+sendingCounter);
			let rawMsg=await messenger.messages.getRaw(message.id);
			accumSize+=rawMsg.length;
			console.log("Total MB:"+(accumSize/(1024*1024))); 
			
			var oResPost=await makeRequest("POST",params.nodejsServer+"/sendtojira",{action:"sendMail", message:btoa(rawMsg)});
			oResPost=JSON.parse(oResPost);
			
		}
	}
}

async function processMails(subfolder){
	//debugger;
	console.log(subfolder.path+": Start Processing");
	var msgPage = await messenger.messages.list(subfolder);
	await processMessages(msgPage.messages);
	while (msgPage.id) {
	  msgPage = await messenger.messages.continueList(msgPage.id);
	  await processMessages(msgPage.messages);
	}
	console.log(subfolder.path+": Finished processing");	
}
async function processSubfolders(subFolders,arrTree,nDeep){
	var sActualName=arrTree[nDeep];
	for (const subfolder of subFolders){
		if (subfolder.name==sActualName){
			if ((arrTree.length-1)>nDeep){
				if (subfolder.subFolders.length>0){
					await processSubfolders(subfolder.subFolders,arrTree,nDeep+1);
				}
			} else {
				await processMails(subfolder);
			}
		}
	}
} 

async function processPaths(account){
	var arrPaths=params.paths.split(";");
	for (const thePath of arrPaths){
		var arrTree=thePath.split("/");
		for (const folder of account.folders){
			if (folder.name==arrTree[0]){
				if (arrTree.length==1){
					await processMails(folder);
				} else if (folder.subFolders.length>0){
					await processSubfolders(folder.subFolders,arrTree,1)
				} 
			}
		}
	}
}

//debugger;
async function process(){
	console.log('clicked process!');
	sendingCounter=0;
	oCounters={};
	accumSize=0;	
	//debugger;
//	await sendEmail();
	// Get all accounts.
	let accounts = await messenger.accounts.list();
	var accountsNames=params.accounts.split(";");
	for (const accountName of accountsNames){
		for (const account of accounts){
			if (account.name==accountName){
	 			await processPaths(account);
			}
		}
	}
	var oResPost=await makeRequest("POST",params.nodejsServer+"/processallissues",{action:"processMails"});
	oResPost=JSON.parse(oResPost);
	debugger;
}

$('#configButton').on('click', async function() {
	//debugger; 
  // Do something when the button is clicked
  params.accounts=$('#inpAccounts').val();
  params.paths=$('#inpPaths').val();
  params.jiraToken=$('#inpJiraToken').val();  
  params.jiraServer=$('#inpJiraServer').val();
  params.nodejsServer=$('#inpNodejsServer').val();

//  params.distinctive=$('#inpDistinctive').val().split(",");
  params.mailsGroup1=$('#inpGroup1').val().split(",");
  params.mailsGroup2=$('#inpGroup2').val().split(",");
  params.mailsGroup3=$('#inpGroup3').val().split(",");
  params.mailsSources=$('#inpGroupSrc').val().split(",");
  
  localStorage.setItem("ExportJiraConfig",JSON.stringify(params));
  await sendConfig();
  await process(); 
}); 


if (localStorage.getItem("ExportJiraConfig") !== null) {
	params=JSON.parse(localStorage.getItem("ExportJiraConfig"));
}
if (typeof params.loaded=="undefined"){
	console.log("the params are not loaded... you can load manually in debugger");
	debugger;
}

if (typeof params.loaded!=="undefined"){
  $('#inpJiraToken').val(params.jiraToken);  
  $('#inpJiraServer').val(params.jiraServer);
  $('#inpNodejsServer').val(params.nodejsServer);  
  $('#inpDistinctive').val(params.distinctive.join(","));
  $('#inpAccounts').val(params.accounts);
  $('#inpPaths').val(params.paths);
  
  $('#inpGroup1').val(params.mailsGroup1.join(","));
  $('#inpGroup2').val(params.mailsGroup2.join(","));
  $('#inpGroup3').val(params.mailsGroup3.join(","));
  $('#inpGroupSrc').val(params.mailsSources.join(",")); 
}

	
console.log('Jira Exporter Window Loaded!');
