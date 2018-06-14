var debugSettings = false;
// For displaying settings in the settings menus dynamically

var setsAll = browser.storage.sync.get()
document.addEventListener( 'DOMContentLoaded', onLoad );

async function onLoad(){
    await restoreOptions()
    return loadedSettings()
};

function saveOptions(){
    console.log("Saving...")
    Array.from(document.getElementsByClassName('setting')).forEach(elem=>{
        setsAll[elem.parentElement.getAttribute('name')][elem.name].value = elem.value
    })
    return browser.storage.sync.set(setsAll);
};

async function restoreOptions(){
    setsAll = await setsAll
    let body = '';
    if(debugSettings) console.log(document.title+':')
    Object.keys(setsAll).forEach( title => {
        body += `
        <div id='${title}' class="container-fluid">
            <center class='heading card card-block'> ${title} </center>
            <div class="row">`
        Object.keys(setsAll[title]).forEach( setting => {
            if( !setsAll[title][setting].hidden || document.title==='Settings' ){ // Hide hidden settings from toolbar.
                let val = setsAll[title][setting].value;
                body += `
                <div class="col-xs-12 col-sm-12 col-md-6 col-lg-4" name="${title}">
                    <center class='card card-block bg-light text-muted'> ${setting} </center>
                    <input class='setting form-control' value=`+
                    (!Number.isNaN(parseFloat(val))?val+' type="number" ':"'"+val+"' ")+
                    `name='${setting}' `;
                    ['min', 'max', 'step', 'placeholder'].forEach( attr=>{
                        if( setsAll[title][setting].hasOwnProperty(attr) ) body += attr+"='"+setsAll[title][setting][attr]+"' ";
                    })
                body += `>
                </div>`
            }
        })
        body += `
            </div>
        </div>
        <br/>`;
    })
    if(debugSettings) console.log( body );
    document.body.innerHTML = body; // The DOM does NOT like adding unmatched <'s. Reassinging this way destroys eventListeners
    Array.from(document.getElementsByClassName('heading')).forEach(heading=>{
        let color = '#'+(0.606060+seededRandom(heading.parentElement.id)).toString(16).slice(2,8);
        heading.style.backgroundColor = color;
    })
    Array.from(document.getElementsByClassName('setting')).forEach(setting=>{
        if(debugSettings) console.log(setting);
        setting.addEventListener( 'change', saveOptions );
    });
    return
};

async function loadedSettings(){
    // console.log('Settings loaded')
    let button = document.createElement('button');
    if(document.title==='Settings'){
        // button.style = "height:30px";
        button.className = "btn btn-secondary"
        button.innerHTML = "Reload Extension";
        button.addEventListener("click", async()=>{
            await saveOptions() // Just to make sure we catch setting changes before reloading.
             browser.runtime.reload().then( _ => location.reload() )
        }); // Wrapped in a func so no args are passed
    }
    if(document.title==='Toolbar'){
        button.style = "width: 100%";
        button.className = "btn btn-secondary"
        button.innerHTML = "More Settings";
        button.addEventListener("click", ()=>{ browser.runtime.openOptionsPage() });
    }
    document.body.appendChild(button);
};


function stringToBytes(string){
    return string.split('').map( char =>{
        code = char.charCodeAt(0)
        return [code & 0xff,(code / 256 >>> 0)].map( byte => {
            return byte.toString().padStart(3,0)
        }).join('')
    }).join('')
}

function seededRandom(seed) {
    seed = parseInt(seed) || parseInt(stringToBytes(seed))
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// // Similar but slightly different handling for checkboxes
// function setValue(element, value){
//     if(element.type=='checkbox') element.checked = value;
//     else element.value = value;
// }

// function removeElement(elementId) {
//     var element = document.getElementById(elementId);
//     element.parentNode.removeChild(element);
// }