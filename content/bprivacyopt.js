



var bprivacyopt = {
    WindowObjectReference: null,
    //prompts: Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),
    //prefs: Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.bprivacy."),




    //Options window opened
    onLoad: function()
    {
          try{
              bprivacy.init ();
              if (bprivacyutils.getPref("extensions.bprivacy.initiated") === 1)   {
                    window.sizeToContent();
                    bprivacyutils.setPref("extensions.bprivacy.initiated", 2);
              } else if (bprivacy.getFFMainVersion() < 4)
                  window.sizeToContent();
              bprivacy.LSOTreeShow(bprivacy.GetFlashDir(0));

              if(
                  ( !bprivacyutils.getPref("extensions.bprivacy.sendpings.allowed") && (bprivacyutils.getPref("extensions.bprivacy.sendpings.allowed") != bprivacyutils.getPref("browser.send_pings")) )
              )
              {
                  if(confirm("BetterPrivacy:\r\nThe addon detected that one or more privacy settings have been modified!\r\nPress OK to correct those values.")){
                      bprivacyutils.setPref("browser.send_pings", bprivacyutils.getPref("extensions.bprivacy.sendpings.allowed"));
                  }
              }
              var interval = bprivacyutils.getPref("extensions.bprivacy.DelTimerInterval");
              var selidx = 2;
              var val = 1;
              if(interval % 86400 == 0){//days
                  val = interval / 86400;
                  selidx = 3;
              }else if(interval % 3600  == 0){ //hours
                  val = interval / 3600;
                  selidx = 2;
              }else if(interval % 60 == 0){ //minutes
                  val = interval / 60;
                  selidx = 1;
              }else if(interval >= 1){
                  val = Math.round(interval);
                  selidx = 0;
              }
              document.getElementById("delInterval").value = val;
              document.getElementById("unitList").selectedIndex = selidx;

              document.getElementById("AutoDelLSOnExitModeID").selectedIndex = bprivacyutils.getPref("extensions.bprivacy.AutoDelLSOnExitMode");
              if(bprivacy.isSeaMonkey)
                  document.getElementById("DelLSONoDialog").label = "Do nothing";

              var sinceDate = bprivacy.getString("since") + " ";
              try{
                  sinceDate += bprivacyutils.prefsBP.getComplexValue("lastSession", Components.interfaces.nsISupportsString).data; //new format may not be available the first time
              }catch(e){sinceDate += bprivacy.getString("installation");}
              document.getElementById("SessionLabelID").value = sinceDate;

              document.getElementById("KeyCodeLabel").value = bprivacyutils.getPref("extensions.bprivacy.keymodifiers") + " + ";
              if(bprivacyutils.getPref("extensions.bprivacy.keycode"))
                  document.getElementById ("KeyCodeBox").value = String.fromCharCode(bprivacyutils.getPref("extensions.bprivacy.keycode"));

              bprivacyopt.AutoIntervalToggled();
              bprivacyopt.AutoDelLSOToggled();
              bprivacyopt.AlwaysReScanToggled(false);
              bprivacyopt.NotifyOnNewLSOToggled();

              var aPref = bprivacyutils.getPref ( "extensions.bprivacy.donotaskfor" );
              if ( aID = document.getElementById("ReEnableWarnings") )  {
                  if ( /1/.test( aPref ) )
                      aID.setAttribute("hidden", "false");
                  else
                      aID.setAttribute("hidden", "true");
              }

              if (bprivacy.getFFMainVersion() < 4)
                    document.getElementById("DOMStorage").setAttribute("hidden", "false");
              if (bprivacy.getFFMainVersion() < 5) {
                    document.getElementById("ManageLSOsPref").setAttribute("hidden", "true");
                    document.getElementById("ReEnableWarningsPref").setAttribute("hidden", "true");
               }

              bprivacyopt.showReEnableWarnings(aPref);
              document.getElementById("MacAcceptBtn").focus();
          }catch(e){alert("An error occured while opening BetterPrivacy\r\nPlease send the following information to the author: \r\n"+e);}
    },






    accept: function(instant)
    {
        try{
      if (instant && document.getElementById("tabbox").selectedIndex != 0)
            return false;
      bprivacyutils.setPref("extensions.bprivacy.alwaysReScan", document.getElementById("alwaysReScanPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.AutoDelLSOnStart", document.getElementById("AutoDelLSOOnStartPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.donotaskonexit", !document.getElementById("DontAskOnExitPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.sendpings.allowed", !document.getElementById("DisablePingPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.useDelTimer", document.getElementById("AutoDelIntervalPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.useDelTimerDelay", document.getElementById("AutoDelIntervalDelayPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.DefaultFlashCookieDeletion", document.getElementById("AutoDelDCPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.delDirs", document.getElementById("AutoDelDirsPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.domclear", document.getElementById("ClearDOMPref").checked);
      bprivacyutils.setPref("extensions.bprivacy.autosubfolders", document.getElementById("AutoProtectSubPref").checked);
      if ( document.getElementById("ManageLSOsPref") ) {
            bprivacyutils.setPref("extensions.bprivacy.manageLSOs", document.getElementById("ManageLSOsPref").checked);
            if (!bprivacyutils.getPref("extensions.bprivacy.manageLSOs"))
               bprivacyutils.setPref("extensions.bprivacy.flashstate", -2);
            else
               bprivacyutils.setPref("extensions.bprivacy.flashstate", -1);
      } else bprivacyutils.setPref("extensions.bprivacy.flashstate", -2);


        if(document.getElementById("NotifyOnNewLSOPref").checked){
            bprivacyutils.setPref("extensions.bprivacy.NotifyOnNewLSO", 2);
        }else{
            bprivacyutils.setPref("extensions.bprivacy.NotifyOnNewLSO", 0);
        }

        bprivacyutils.setPref("extensions.bprivacy.NotifyDuration", parseInt(document.getElementById("NotifyDurationID").value));

        if(document.getElementById("AutoDelLSOnExitModeID").selectedIndex >= 0)
            bprivacyutils.setPref("extensions.bprivacy.AutoDelLSOnExitMode", document.getElementById("AutoDelLSOnExitModeID").selectedIndex);

        if(document.getElementById("DisablePingPref").checked){
            bprivacyutils.setPref("browser.send_pings", false);
            bprivacyutils.setPref("extensions.bprivacy.sendpings.allowed", false);
        }else{
            bprivacyutils.setPref("browser.send_pings", true);
            bprivacyutils.setPref("extensions.bprivacy.sendpings.allowed", true);
        }

    var interval = document.getElementById("delInterval").value;
        var idx = document.getElementById("unitList").selectedIndex;
        var factor = 60 * 60; //default hours
        if(idx == 0)
            factor = 1; //seconds
        else if(idx == 1)
            factor = 60;  //minutes
        else if(idx == 2)
            factor = 60 * 60; //hours
        else if(idx == 3)
            factor = 60 * 60 * 24; //days
        interval = interval * factor;
        bprivacyutils.setPref("extensions.bprivacy.DelTimerInterval", interval);
        bprivacyutils.setPref("extensions.bprivacy.removedSession", 0);//statistics
        var cDate = new Date();
        var localDate = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
        localDate.data = cDate.toLocaleString();
        bprivacyutils.prefsBP.setComplexValue("lastSession", Components.interfaces.nsISupportsString, localDate);//for statistics

    var keycodeBox = document.getElementById ("KeyCodeBox");
        if(keycodeBox){
            var value = keycodeBox.value ? keycodeBox.value.charCodeAt(0) : 0;
            bprivacyutils.setPref("extensions.bprivacy.keycode", value);
        }
        bprivacy.SetKeys();
        }catch(e){alert("An error occured while saving BetterPrivacy options\r\nPlease send the following information to the author: \r\n"+e);}
    return true;
    },




    AutoDelLSOToggled: function()
    {
    if(!document.getElementById("AutoDelLSOnExitModeID").selectedIndex)
            document.getElementById("DontAskOnExitPref").disabled = false;
        else
            document.getElementById("DontAskOnExitPref").disabled = true;
    },

  ReEnableWarningsToggled: function()
    {
      bprivacyutils.clearPref( "extensions.bprivacy.donotaskfor" );
      document.getElementById("ReEnableWarningsPref").setAttribute("hidden", "true");
    },



  ManageLSOsToggled: function()
    {
      var aID = document.getElementById("ManageLSOsPref");
      if ( ! aID )
                return;
      var aPref = bprivacyutils.getPref ( "extensions.bprivacy.donotaskfor"  );
      var check = { value: false };
            if (aID.checked === false) {
            if ( !Number (aPref [0]) )
            {
                  var confirmed = bprivacy.prompts.confirmCheck ( window, "BetterPrivacy Warning", bprivacy.getString ( "askmanageLSOs" ), bprivacy.getString ( "donotaskagain" ), check );
                  aPref = bprivacy.changeCharAt ( aPref, 0,  String ( Number ( check.value ) ) ) ;
                  bprivacyutils.setPref ( "extensions.bprivacy.donotaskfor", aPref );
                  if ( confirmed )
                      aID.checked = true;
                  window.focus();
            }
      }
    bprivacyopt.showReEnableWarnings(aPref);
    },


  showReEnableWarnings: function(aPref)
    {
      var aID = document.getElementById ("ReEnableWarningsPref");
      if ( /1/.test( aPref ) )
          aID.setAttribute("hidden", "false");
      else
          aID.setAttribute("hidden", "true");
    },

    AutoIntervalToggled: function()
    {
            if(document.getElementById("AutoDelIntervalPref").checked == false){
                document.getElementById("AutoDelIntervalDelayPref").disabled = true;
                document.getElementById("delIntervallabel").disabled = true;
                document.getElementById("delInterval").disabled = true;
                document.getElementById("unitList").disabled = true;
            }else{
                document.getElementById("AutoDelIntervalDelayPref").disabled = false;
                document.getElementById("delIntervallabel").disabled = false;
                document.getElementById("delInterval").disabled = false;
                document.getElementById("unitList").disabled = false;
            }
    },


    AlwaysReScanToggled: function(byButton)
    {
            if(byButton && document.getElementById("alwaysReScanPref").checked == true)
            {
                if(!confirm(bprivacy.getString("alwaysRescan")))
                    document.getElementById("alwaysReScanPref").checked = false;
            }
            if(document.getElementById("alwaysReScanPref").checked == false){
                document.getElementById("selectFolderID").disabled = false;
            }else{
                document.getElementById("selectFolderID").disabled = true;
            }
    },




    DelIntervalToggled: function()
    {
      bprivacy.tStart = new Date();
    },


    savePrefs: function(win)
    {
      try{
          document.getElementById("bprivacy-prefpane").writePreferences (true);
      }catch(e){ alert("BetterPrivacy: Error saving settings: "+e); }
    },


    NotifyOnNewLSOToggled: function(byuser)
    {
        if(document.getElementById("NotifyOnNewLSOPref").checked == true){
            var message = bprivacy.getString("constantparsingwarning");
            if(byuser && !bprivacy.prompts.confirm(null, "BetterPrivacy Warning", message))
            {
                document.getElementById("NotifyOnNewLSOPref").checked = false;
                return;
            }
            document.getElementById("NotifyDurationID").disabled = false;
        }else{
            document.getElementById("NotifyDurationID").disabled = true;
        }
    },


    initPL: function()
    {
        window.sizeToContent();
        bprivacy.init ();
        var arrList = bprivacyutils.prefsBP.getComplexValue("Exclusions", Components.interfaces.nsISupportsString).data.split("|");
        var listBox = document.getElementById ("listBox");
        for (var j=0;j<arrList.length;j++) {
                try{
                        var val = "";
                        val = arrList.slice(j,j+1).toString();
                        if(val.length > 0)
                            listBox.appendChild (bprivacyopt.newListItem (val, val));
                }catch(e){}
        }
        arrList = null;
    },



    acceptPL: function()
    {
      var listBox = document.getElementById ("listBox");
            var list = [];
      list = bprivacyopt.listBoxToArray(listBox);
            var str = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
            str.data = list.join("|");
      var oldList = bprivacyutils.prefsBP.getComplexValue("Exclusions", Components.interfaces.nsISupportsString).data;
      if ( oldList !== str.data )
                bprivacyutils.prefsBP.setComplexValue("Exclusions", Components.interfaces.nsISupportsString, str);
    },

  listBoxToArray: function (listBox)
  {
            var list = [];
            var rows = listBox.getRowCount ();
            for (var n = 0; n < rows; n++)
            {
                var listitem = listBox.getItemAtIndex (n);
                var listcell = listitem.childNodes.item (0);
                var value = listcell.getAttribute("value").replace(/[\\\/]+$/i, "");
                value = listcell.getAttribute("value").replace(/^[\/]/, "").replace(/[\\\/]+$/, "");
                list.push (value);
            }
      return list;
  },


    EditPL: function()
    {
        //modal window
        window.open("chrome://bprivacy/content/bprivacyeditpl.xul", "", "chrome=yes,modal=yes,resizable=yes,width=750,height=350");
        bprivacy.RefreshLSOProtection();
        bprivacy.updateGUI(false);
        bprivacy.TreeOnSelect();
    },


    newListItem: function (label, value)
    {
        var row = document.createElement ("listitem");
        row.setAttribute ("allowevents", true);
        var cell = document.createElement ("listcell");
        cell.setAttribute ("id", "");
        cell.setAttribute ("label", label);
        cell.setAttribute ("value", value);
        row.appendChild (cell);
        return row;
    },


    listTextboxOnInput: function  (event)
    {
        var add = document.getElementById ("listAdd");
        var textbox = event.target;
        if (0 < textbox.textLength)
        {
            add.removeAttribute ("disabled");
        }
        else
        {
            add.setAttribute ("disabled", true);
        }
    },

    listBoxOnSelect: function  (event)
    {
        document.getElementById ("listEdit").removeAttribute ("disabled");
        document.getElementById ("listRemove").removeAttribute ("disabled");
    },


    listAddOnCommand: function  (event)
    {
        var textbox = document.getElementById ("listTextbox");
    var path  = textbox.value;
        if(path.length < 2){
            alert("Input too short");
            return;
        }
        var listBox = document.getElementById ("listBox");
        var protListarr = [];
    protListarr = bprivacyopt.listBoxToArray(listBox);
    if ( bprivacy.isProtectedPath (path, protListarr) ) {
                protListarr = undefined;
        return;
    }
    if ( document.getElementById ("AutoEscapePref").checked )
        path = bprivacy.RegExpEscape(path);
        listBox.appendChild (bprivacyopt.newListItem (path, path));
    },


    listEditOnCommand: function  (event)
    {
        var listBox = document.getElementById ("listBox");
        if (listBox.selectedItem == null)
            return;
        var listcell = listBox.selectedItem.childNodes.item (0);
        var inout = { value: listcell.getAttribute ("value") };

        bprivacy.prompts.prompt(null, bprivacy.getString("editprompt"), bprivacy.getString("regexexpected"), inout, null, { value: false });
        if(inout.value.length < 2){
            alert("Input too short");
            return;
        }
    var path  = inout.value;
    if ( document.getElementById ("AutoEscapePref").checked )
        path = bprivacy.RegExpEscape(path);
        listcell.setAttribute ("label", path);
        listcell.setAttribute ("value",path);
    },


    listRemoveOnCommand: function  (event)
    {
        document.getElementById ("listRemove").setAttribute ("disabled", true);
        var listBox = document.getElementById ("listBox");
        if (listBox.selectedItem != null)
            listBox.removeChild (listBox.selectedItem);
    },


    keyDelCookie: function (event)
    {
        if (event.keyCode == 46)
            bprivacy.DeleteLso();
    },







};