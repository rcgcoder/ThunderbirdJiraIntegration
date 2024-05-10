// Import all functions defined in the messageTools module.
//import * as messageTools from '/modules/messageTools.mjs';
import * as exporterToJira from '/modules/exporter.mjs';


var fncCreateCallback=function(err){
	console.log("Created!");
	console.log(browser.runtime.lastError);
}
// Create the menu entries.
let menu_id = await messenger.menus.create({
    title: "Mail Exporter to Jira",
    contexts: [
        "browser_action",
        "tools_menu"
    ],
},fncCreateCallback);

var fncClick=async function(){ 
	console.log("Click en el boton");
	await exporterToJira.show();
}
// Register a listener for the menus.onClicked event.
await messenger.menus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId == menu_id) {
        // Our menu entry was clicked
        fncClick();
    }
});

// Get all accounts.
let accounts = await messenger.accounts.list();
for (const account of accounts){
	if (account.name=='extensionConfig'){
		console.log("Testing");
	}
}

