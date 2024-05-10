// Function to open a popup and await user feedback
var objConf={
	accounts:[]
}

export function getActual(){
	return objConf
}
export async function show() {
    async function showExporter(popupId, defaultResponse) {
        try {
            await messenger.windows.get(popupId);
        } catch (e) {
            // Window does not exist, assume closed.
            return defaultResponse;
        }
        return new Promise(resolve => {
            let response = defaultResponse;
            function windowRemoveListener(closedId) {
                if (popupId == closedId) {
                    messenger.windows.onRemoved.removeListener(windowRemoveListener);
                    messenger.runtime.onMessage.removeListener(messageListener);
                    resolve(response);
                }
            }
            function messageListener(request, sender, sendResponse) {
                if (sender.tab.windowId != popupId || !request) {
                    return;
                }
                
                if (request.popupResponse) {
                    response = request.popupResponse;
                }
                if (request.ping) {
                    console.log("Background ping")
                }
            }
            messenger.runtime.onMessage.addListener(messageListener);
            messenger.windows.onRemoved.addListener(windowRemoveListener);
        });
    }

    let window = await messenger.windows.create({
        url: "../exporter/exporter.html",
        type: "popup",
        height: 500,
        width: 500,
        allowScriptsToClose: true,
    });
    // Wait for the popup to be closed and define a default return value if the
    // window is closed without clicking a button.
    let rv = await showExporter(window.id, "cancel");
    console.log(rv);
}
 