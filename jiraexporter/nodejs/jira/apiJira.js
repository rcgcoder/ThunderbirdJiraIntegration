// This code sample uses the 'node-fetch' library:
// https://www.npmjs.com/package/node-fetch
 
function jiraFormatDateTime(d){
	var sDate=[d.getFullYear(),
              ((d.getMonth()+1)+"").padStart(2,"0"),
               (d.getDate()+"").padStart(2,"0")
               ].join('-');
               
    var sHour=[(d.getHours()+"").padStart(2,'0'),
               (d.getMinutes()+"").padStart(2,'0'),
               (d.getSeconds()+"").padStart(2,'0')].join(':');
    debugger;           
    var dformat =sDate +'T' + sHour +".000"+d.toString().split(" (")[0].split(" GMT")[1];
    return dformat;
}

function getBaseData(mail,params){
	const bodyData = { 
	  "fields": {
	    "project": {
	      "id": "10440" //Project SMRR
	    },	
	    "issuetype": {
	      "id": "10269" //Issue Type : "Correo Electrónico"
	    }
	  },
	  "update": {}
	};

	var sTo="";
	if (typeof mail.to!=="undefined"){
		if (typeof mail.to==="string"){
			sTo=mail.to;
		} else {
			sTo=mail.to.join(";");
		}
	}
	var sCC="";  
	if (typeof mail.cc!=="undefined"){
		if (typeof mail.cc==="string"){
			sCC=mail.cc;
		} else { 
			sCC=mail.cc.join(";")
		}
	}
	
	var mailDateTime=jiraFormatDateTime(mail.date);
	if (sTo!==""){
		bodyData.fields["customfield_10112"]=sTo;	
	}
	if (sCC!==""){
		bodyData.fields["customfield_10113"]=sCC;	
	}
	bodyData.fields["customfield_10111"]=mail.from;
	if (typeof mail.subject!=="undefined"){
		bodyData.fields["summary"]=mail.subject.substring(0,250);
	} else {
		bodyData.fields["summary"]="Sin Asunto";
	}
	if ((typeof mail.text!=="undefined")&&(mail.text!=="")){
		bodyData.fields["description"]=mail.text;
	} else { 
		bodyData.fields["description"]=mail.html;
	} 

	bodyData.fields["customfield_10106"]=mailDateTime;
	//bodyData.fields["customfield_10098"]=""; //actuación
	
	var msgIDs=["Message-ID","References","In-Reply-To","X-Forwarded-Message-Id"];
	var msgIDFields=["customfield_10107","customfield_10108","customfield_10109","customfield_10110"];
	for (var i=0;i<msgIDs.length;i++){
		var value=mail[msgIDs[i]];
		if (value!==""){
			bodyData.fields[msgIDFields[i]]=value;
		}
	}
	
	var bC15=false;
	var bC11=false;
	var bCAU=false;
	var bReceived=false;
	//C15 - SETELECO
	var C15mails=params.mailsGroup1;
	for (const dir of C15mails){
		if (sTo.indexOf(dir)>=0){
			bC15=true;
		}
		if (mail.from.indexOf(dir)>=0){
			bC15=true;
			bReceived=true;
		}
	}
	//C11 - Digitalización
	var C11mails=params.mailsGroup2;
	for (const dir of C11mails){
		if (sTo.indexOf(dir)>=0){
			bC11=true;
		}
		if (mail.from.indexOf(dir)>=0){
			bC11=true;
			bReceived=true;
		}
	}
	
	//soporte Coffee
	var CAUCoffee=params.mailsGroup3;
	for (const dir of CAUCoffee){
		if (sTo.indexOf(dir)>=0){
			bCAU=true;
		}
		if (mail.from.indexOf(dir)>=0){
			bCAU=true;
			bReceived=true;
		}
	}
	//Origen para saber si son de salida o correos recibidos
	var SRCmails=params.mailsSources;
	for (const dir of SRCmails){
		if (mail.from.indexOf(dir)>=0){
			bReceived=false;
		}
	}
	if (bReceived){
		bodyData.fields["customfield_10101"]= { //Sentido
			"id": "10106"  //recibido
		};
	} else {
		bodyData.fields["customfield_10101"]= { //Sentido
			"id": "10107" //enviado
		};
	}
	
	if (bC15){
		bodyData.fields["customfield_10097"]= { //Subproyecto
			"id": "10105" //todos o alguno de Componente 11
		};
	} else if (bC11){
		bodyData.fields["customfield_10097"]= { //Subproyecto
			"id": "10087" //Componente 11
		};
	} else if (bCAU){
		bodyData.fields["customfield_10097"]= { //Subproyecto
			"id": "10108" //CAU
		};
	}
/*	    "customfield_10100": { //Linea de Trabajo de Componente 11  
		 	"id": "10094"
		},
		"customfield_10099": { //Subproyecto Instrumental
			"id": "10082"
		}*/

	return bodyData;
}   


module.exports = (mail)=>{
	var bodyData=getBaseData(mail,params);
	return bodyData;
}
