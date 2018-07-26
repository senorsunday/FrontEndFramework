console.log('Starting Front End Framework...');
var debug=true,
    colors={};

// Event listeners are functions that asynchronously trigger whenever an event happens.
browser.runtime.onMessage.addListener( async(message, sender, response) => {
    if(debug) console.log('We get signal:\n\t', message, '\n\t', sender, '\n\t', response);
    if(message==='main'){
        console.log('Reloading Front End Framework...');
        await main();
        response(true);
    }
    return true;
});

// For those new to Promises, to view the contents in the console,
// just use promise.then( a => console.log(a) );
storage.get().then( a => { console.log("Settings:", a) } );
var menuActions = {},           // These are dynamically populated further down
    menuCounter = 0,
    HRCounter = 0;
var titleRE = /([^\/]+).json/i; // A pattern using the config filename as it's title
main();                                 // Run once the program starts, or triggered when settings change
setInterval( ( _=> main() ), 86400000); // And refresh every day

async function main(){  // Same as 'const main = async function(){...}'
    if(debug) console.log('Running main()');
    await clear();      // Wipes the previous session
    let configURIs = [],// 'let' bounds the variable to this function's scope and down.
        localConfigNames = await ls( 'Configs/', flags='R' ); // 'await' syncs Promises/aysnc functions.
    // Convert the path/name to a full URI string to GET.
    for( let i = 0; i < localConfigNames.length; i++ ){
        if( localConfigNames[i].toLowerCase().endsWith('.json') ){           // Filter out non-config files.
            configURIs.push( browser.extension.getURL(localConfigNames[i]) );// browser.extension.getURL() directly returns a string.
        }
    }
    // Async start the process of loading settings (at this point), which is usually less than a sec.
    let setsAll = storage.get(); // A Promise (async function) that resolves as an object full of settings
    // If we still have the front end famework config in the Configs folder,
    // we'll use that as an indicator that we want to enable the user to
    // list config files on remote servers to download.
    if( localConfigNames.includes("Configs/framework.json") ){
        setsAll = await setsAll // If we need this now, we need to wait for it to resolve now.
        if( setsAll.hasOwnProperty('Front End Framework') ){
            // branch is basically python's dict.get()
            let uris = branch( setsAll, 'Front End Framework.Config URLs.value', '' ).split(',')
            for( let i = 0; i < uris.length; i++ ){
                if(uri.length>0){ // So we aren't just padding and requesting 'https://'
                    if(!uri.startsWith('http')) uri = 'https://'+uri;
                    configURIs.push(uri);
                }
            }
        }; // Else this is the first time running this ext, or you just threw in a framework.json
    }
    // Start GET'ing all of the configs and wait for them to all finish.
    if(debug) console.log("configURIs:", configURIs);
    let configPromises = configURIs.map( filename => fetchObject(filename, {cache: "no-store", retry:true} ) );
    let configWErr = await Promise.all(configPromises); // Promise.all() returns a promise that resolves when all children to finish.
    let configs = [];
    for (let i = 0; i < configWErr.length; i++){
        if(configWErr[i]!==undefined){
            configs.push(configWErr[i]);
        }
    }
    // In case we haven't already.
    setsAll = await setsAll; // You can call this as many times as you want without adding eval time.
    // Create settings for new config files and set new default values for new settings
    let populated = populateSettings(configs, setsAll);
    // Let's async remove settings for configs we don't have, while we're at it.
    let cleanedUp = removedConfigs(configs, setsAll);
    // Now let's apply the configs
    await populated; // First we need to make sure new settings have defaults set in Settings.
    menuCounter = 0; // Resetting these vals in case main() is re-run
    HRCounter = 0;
    for( let i = 0; i < configs.length; i++ ){
        let config = configs[i];
        if(config){
            let defaults = branch(config, 'default', {});
            // if(debug) console.log("Defaults:", defaults);
            if(config.hasOwnProperty('menuItems')){
                menuCounter += 1;
                await buildMenu(config.title, config.menuItems, defaults);
            }
        }
    };
    // if(debug) console.log("Menu Actions:",menuActions)
    browser.contextMenus.onClicked.addListener(addActions);
}

///////////////////////////
// Supporting Functions //
/////////////////////////
// Some are defined in utilities.js

// So we don't keep adding copies of the same functions and elements from the configs
async function clear(){
    menuActions={};
    browser.contextMenus.onClicked.removeListener(addActions);
    return browser.contextMenus.removeAll(); // This doesn't remove event listeners, so we do above.
}

// We need to isolate this function so that it can be
// explicitly removed from an event listener in clear()
function addActions(info, tab){ menuActions[info.menuItemId](info, tab); }

// Building the context menu (right click)
async function buildMenu(title, menuItems, def){
    if(menuCounter>=2) menuItems.unshift({ "type":"separator" }) // Divide menus between configs
    for( let i = 0; i < menuItems.length; i++ ){
        let item = menuItems[i];
        // if(debug) console.log(item);
        let menuObj = {
            "contexts": branch(item, 'contexts') || branch(def, 'contexts') || ["all"],
            "documentUrlPatterns": branch(item, 'matchPatterns') || branch(def, 'matchPatterns') || ["*://*/*"]
        }
        if(item.type==='separator'){    // Separators are special,
            menuObj.id = "HR"+HRCounter;// they still need a unique ID
            menuObj.type = "separator"; // and they need to be of this special type,
            HRCounter += 1;             // but they don't need any other attributes.
        }
        else{
            menuObj.id = item.id;
            menuObj.title = item.title;
            if(item.hasOwnProperty('icons')){
                if(item.icons.includes('.')) menuObj.icons = { '16': item.icons }
                else if(def.hasOwnProperty('icons')) menuObj.icons = { '16': def.icons[item.icons] } // If the address doesn't have a key, its a default icon
            }
            if(item.hasOwnProperty('actions')){
                // if(debug) console.log(item.id+"'s Actions:",item.actions)
                // Throwing in a function that will be triggered by the onClick event listener for the menu item
                menuActions[item.id] = ((info, tab)=>{
                    // Input is the specific context that is being passed to the action function (ex. selected text)
                    let output = null;
                    // Output is the current output wrapped in a promise, which is passed as input if actions are chained
                    let input = branch( item, 'input' ) || branch( def, 'input' ) || 'selection';
                    if(input==='selection') output = new Promise((res)=>{res({'data':info.selectionText, 'tab':tab})})
                    (async()=>{ // Wrapping this in an IIFE so we can skip broken menu items one at a time
                        for( let j = 0; j < item.actions.length; j++ ){
                            let action = item.actions[j];
                            // if(debug) console.log('action', action)
                            // Await to a non-promise returns the variable as is
                            response = await output
                            // if(debug) console.log("Response:",response)
                            if(action.hasOwnProperty('parse')){
                                let re = branch(action, 'parse.pattern') || branch(def, 'parse.pattern') || ".*",
                                    flags = branch(action, 'parse.flags') || branch(def, 'parse.flags') || "gim",
                                    groups = branch(action, 'parse.groups') || branch(def, 'parse.groups') || [0],
                                    join = branch(action, 'parse.join') || branch(def, 'parse.join') || " ";
                                // if(debug) console.log( 'Input:', response.data, '\nPattern:', re, '\nFlags:', flags, '\nGroups:', groups, '\nJoin:', join, '\nOutput:',Array.from(parsePattern(response.data, re, flags, groups)).join(join) );
                                response.data = Array.from(parsePattern(response.data, re, flags, groups)).join(join)
                            }
                            if(action.hasOwnProperty('copy')) sendToClipboard(response.data, response.tab)
                            if(action.hasOwnProperty('request')){
                                let url = await mapURL( action.request.url, title, response.data );
                                // if(debug) console.log("URL", url );
                                if(url.length===0){
                                    console.log("Broken URL from object", action.request)
                                    return
                                }
                                if(action.request.open){
                                    let tab = await browser.tabs.create({ 'url' : url })
                                    response = { 'data':response.data, 'tab':tab };
                                }
                                else{
                                    let method = action.request.method || "GET";
                                    if(method==="GET") body = undefined;
                                    let request = await fetch(url, {"method":method, "body":body});
                                    let text = await request.text();
                                    response = { 'data':text, 'tab':tab };
                                }
                            }
                            else if(action.hasOwnProperty('api')){
                                let [url, body] = await mapURL( action.api, title, response.data );
                                
                            }
                            output = response; // Just in case we need to pass this in for another action
                            return
                        };
                    })();
                    return output
                }); 
            }
            else menuActions[item.id] = (()=>{console.log('No Actions')});
        }
        // if(debug) console.log(menuObj.id,menuObj);
        browser.contextMenus.create(menuObj);
    };
}

async function mapURL(request, title, responseData){
    // if(debug) console.log('CALLING MAPURL', request);
    async function mapper(part){
        if(part=='@data') return responseData;
        else if(part.startsWith('@')){
            let setting = await storage.get(title).then(settings=>{
                return branch(settings, title+'.'+part.slice(1)+'.value');
            })
            // if(debug) console.log(part.slice(1), '"'+setting+'"');
            return setting;
        }
        return part;
    }
    let url = await Promise.all( request.map(mapper) ).then(part=>part.join(''));
    if(debug) {
        console.log('URL', url)
    }
    return url;
}

function populateSettings(configs, setsAll){
    return Promise.all( // Just to make sure we generate all the settings before relying on them.
        configs.map( config => {
            let output = {}; // Since you can't use variables as keys in literal notation - {key:value}
            output[ config.title ] = config.settings;
            if( setsAll.hasOwnProperty( config.title ) ){ // Indicating an exisiting config, so we only add new settings.
                Object.keys( config.settings ).forEach( setting =>{
                    if( setsAll[ config.title ].hasOwnProperty( setting ) ){ // Overwrite with current value if it exists.
                        output[ config.title ][ setting ].value = setsAll[ config.title ][ setting ].value
                    }
                })
            }
            return storage.set( output );
        })
    )
}

function removedConfigs(configs, setsAll){
    let titles = configs.map( config => config.title );
    return Promise.all( // We don't need to wait for this unless we're displaying all settings.
        Object.keys(setsAll).map( title => {
            if( !titles.includes(title) ){ // Promise all considers non-Promise elements as resolved.
                return storage.remove(title)
            }
        })
    );
}

// function notify(message, title, body=[], link=null){
//     browser.notifications.create('', {
//         "type": "basic",
//         "iconUrl": browser.extension.getURL("Public/Icons/favicon.svg"),
//         "title": title,
//         "message": message
//     })
//     if(body.length>0){
//         browser.notifications.onClicked.addListener( id => {
//             let template = '../Public/template.html',
//                 content = {
//                     "title": title,
//                     "body": body
//                 };
//             pageBuilder(template, content)
//             browser.notifications.clear(id);
//         });
//     }
//     else if(link!==null){
//         return browser.tabs.create
//     }
// }

function sendToClipboard(text, tab){ // The tab variable is needed to ID which tab to execute active code in
    let code = "copyToClipboard(" + JSON.stringify(text) + ");";
    return browser.tabs.executeScript(tab.id, {
        code,
    });
}