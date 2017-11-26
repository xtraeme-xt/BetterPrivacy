



var bprivacyUninstallListener = {

  onUninstalling: function(addon) {
    if (addon.id == "{d40f5e7b-d2cf-4856-b441-cc613eeffbe3}") {
          if (bprivacyutils.getPref ( "extensions.bprivacy.flashstate" ) > -3)
            bprivacyutils.setPref ( "extensions.bprivacy.flashstate", -2 );

    }
  },
  onDisabling: function(addon) {
    if (addon.id == "{d40f5e7b-d2cf-4856-b441-cc613eeffbe3}") {
      if (addon.isActive) {
            if (bprivacyutils.getPref ( "extensions.bprivacy.flashstate" ) > -3)
              bprivacyutils.setPref ( "extensions.bprivacy.flashstate", -2 );
        }
      }
  },
  onOperationCancelled: function(addon) {
    if (addon.id == "{d40f5e7b-d2cf-4856-b441-cc613eeffbe3}") {
            if (bprivacyutils.getPref ( "extensions.bprivacy.flashstate" ) > -3)
                bprivacyutils.setPref ( "extensions.bprivacy.flashstate", bprivacyutils.getPref ( "plugin.state.flash" ) );
    }
  }
}








var bprivacyObserver = {
  calls: 0,

       QueryInterface: function ( aIID )  {
          if ( aIID.equals ( Components.interfaces.nsIWebProgressListener )    ||
              aIID.equals ( Components.interfaces.nsISupportsWeakReference ) ||
              aIID.equals ( Components.interfaces.nsISupports ) )
                   return this;
          throw Components.results.NS_NOINTERFACE;
       },
        register: function (aTopic)
        {
            Components.classes ["@mozilla.org/observer-service;1"].getService ( Components.interfaces.nsIObserverService ).addObserver ( this, aTopic, false );
            // note: "quit-application-granted" sends no data value to determine if restart or shutdown
            // "quit-application-granted" is UNRELIABLE since not triggered by closing a window with x ( upper right window corner)
            // "quit-application" is not triggered at all
            // still valid for FF 5
        },
      unregister: function (aTopic) {
              Components.classes ["@mozilla.org/observer-service;1"].getService ( Components.interfaces.nsIObserverService ).removeObserver(this, aTopic);
      },
        observe: function ( aSubject, aTopic, aData )
        {
          //alert ( aTopic+'   '+aData );
          if ( aTopic ===  "quit-application-requested" ) {
                bprivacy.onexit ();
          } else if ( aTopic === "cookie-changed" && aData === "added") {         //not needed: || aData === "changed"
                if (this.calls > 50)      //for additional safety: prevent Firefox freeze caused by loop-backs (e.g. BeefTaco add-on always replaces deleted opt-out cookies)
                    this.unregister("cookie-changed");
                else {
                    //let aCookie = aSubject.QueryInterface(Components.interfaces.nsICookie); alert (aCookie.host);
                    //bprivacy.handleSanitizeCookies (true,{});     //bug
                    setTimeout ( function () {bprivacy.handleSanitizeCookies (true,{});}, 0 );    //should allow normal termination
                }
                this.calls++;
          }
        },

 } ;


var bprivacyPrefObserver = {
        register: function()
        {
          var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
          this._branch = prefService.getBranch("");
          this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
          this._branch.addObserver("", this, false);
        },
        observe: function(aSubject, aTopic, aData)
        {
          if ( aTopic !== "nsPref:changed" ||  !( /(privatebrowsing\.|privacy\.|bprivacy\.)/ ).test ( aData ) )
              return;

          var BPmanageLSOs = !!bprivacyutils.getPref ( "extensions.bprivacy.manageLSOs" );
          var privatebrowsing  = bprivacyutils.getPref ( "browser.privatebrowsing.autostart" );
          var check = { value: false };
          var aPref = bprivacyutils.getPref ( "extensions.bprivacy.donotaskfor"  );
          var win = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("");
          var aID;
          var overrides = {};

          switch ( aData ) {
          case "browser.privatebrowsing.autostart":
                  overrides.privatebrowsing = false;
                  if ( ( BPmanageLSOs && privatebrowsing ) && bprivacy.shouldHandleCookieClearing(overrides) )  {
                        if ( !Number (aPref [1]) )
                        {
                              var confirmed = bprivacy.prompts.confirmCheck ( null, "BetterPrivacy Warning", bprivacy.getString ( "askprivatebrowsing" ), bprivacy.getString ( "donotaskagain" ), check );
                              aPref = bprivacy.changeCharAt ( aPref, 1,  String ( Number ( check.value ) ) ) ;
                              if ( confirmed )
                                 bprivacyutils.setPref ("browser.privatebrowsing.autostart", false);
                        }
                  }
          break;
          case "extensions.bprivacy.Exclusions":
                  overrides.privatebrowsing = false;
                  overrides.BPmanageLSOs = true;
                  if ( ( !BPmanageLSOs || privatebrowsing ) && bprivacy.shouldHandleCookieClearing(overrides) )  {
                        var confirmed = bprivacy.prompts.confirm ( null, "BetterPrivacy Warning", bprivacy.getString ( "askaddExcusions" ) );
                        if ( confirmed ) {
                            bprivacyutils.setPref ("extensions.bprivacy.manageLSOs", true);
                            bprivacyutils.setPref ("browser.privatebrowsing.autostart", false);
                        }
                  }
          break;
          }
          //win.focus();
          bprivacyutils.setPref ( "extensions.bprivacy.donotaskfor", aPref );
          aID = win.document ? win.document.getElementById ("ReEnableWarningsPref") : undefined;
          if ( aID && bprivacy.getFFMainVersion() > 4 )  {
              if ( /1/.test( aPref ) )
                  aID.setAttribute("hidden", "false");
              else
                  aID.setAttribute("hidden", "true");
          }

        },
};





var bprivacy = {
    lsos: [],
    Stack: [],
    timerID: 0,
    tStart: null,
    tTicks: null,
    selected: null,
    Scan: 0,
    loaded: 0,



    LOG: function ( text )
    {
        var consoleService = Components.classes ["@mozilla.org/consoleservice;1"].getService ( Components.interfaces.nsIConsoleService );
        consoleService.logStringMessage ( text );
    },


    WindowOnEnter: function ( event ) {
        if ( event.keyCode == 13 ) { return false; }
        return true;
    },

    getFFMainVersion: function () {
      var mainVersion =  parseInt(Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo).version.replace ( /^([^\.]+)/i, "$1" ));
        return mainVersion;
    },

  changeCharAt: function ( str, idx, chr ) {
    if ( idx > str.length - 1 )
        return str;
    return str.substr ( 0, idx ) + chr + str.substr ( idx + 1 );
  },

    openHelp: function ( page )
    {
    var aBrowser =  typeof gBrowser !== 'undefined' ? gBrowser :  ( typeof  bprivacy.wm.getMostRecentWindow ( "navigator:browser" )  !== 'undefined' ? bprivacy.wm.getMostRecentWindow ( "navigator:browser" ).gBrowser : undefined );
        if ( typeof aBrowser !== 'undefined' )
            aBrowser.selectedTab = aBrowser.addTab ( page );

        else if ( bprivacyopt.WindowObjectReference == null || bprivacyopt.WindowObjectReference.closed )
        {
            try {
                bprivacyopt.WindowObjectReference = window.open ( page, "", "width=800,height=600,alwaysRaised=yes,resizable=yes,scrollbars=yes,status=no" );
            }catch ( e ){}
    }

    },


    getDoc: function ()
    {
        var doc = bprivacy.mw.document;
        if ( !doc )
            doc = window.document;
        return doc;
    },




    convert: function ()
    {
        var PrefSrv = Components.classes ["@mozilla.org/preferences-service;1"].getService ( Components.interfaces.nsIPrefBranch );
        //AutoDelLSO
        try {
            if ( bprivacyutils.prefs.getBoolPref ( "extensions.bprivacy.AutoDelLSO" ) == false )
                bprivacyutils.setPref ( "extensions.bprivacy.AutoDelLSOnExitMode", 1 );
            PrefSrv.clearUserPref ( "extensions.bprivacy.AutoDelLSO" ); //delete preference
        } catch ( e ){}
        //FlashAppDir
        try {
            if ( bprivacyutils.prefs.getCharPref ( "extensions.bprivacy.flashAppDir" ) && String ( bprivacyutils.prefs.getCharPref ( "extensions.bprivacy.flashAppDir" )).length )
            {
                var Dir = Components.classes ["@mozilla.org/file/local;1"].createInstance ( Components.interfaces.nsILocalFile );
                  Dir.initWithPath ( bprivacyutils.getPref ( "extensions.bprivacy.flashAppDir" ));
                  if ( Dir.path && Dir.exists () && Dir.isDirectory ())
                    bprivacyutils.prefsBP.setComplexValue ( "DataDir", Components.interfaces.nsILocalFile, Dir );
            }
            PrefSrv.clearUserPref ( "extensions.bprivacy.flashAppDir" ); //delete preference
        } catch ( e ){}
        //DOMStorage
        try {
            if ( bprivacyutils.prefs.getBoolPref ( "extensions.bprivacy.domstorage.allowed" ) == false )
            {
                bprivacyutils.setPref ( "extensions.bprivacy.domclear", true );
                bprivacyutils.setPref ( "dom.storage.enabled", true );
                PrefSrv.clearUserPref ( "extensions.bprivacy.domstorage.allowed" ); //delete preference
            }
        } catch ( e ){}
        //ProtectionList  to complex value
        try {
            if ( bprivacyutils.getPref ( "extensions.bprivacy.protectedLSOList" ).length )
            {
                var str = Components.classes ["@mozilla.org/supports-string;1"].createInstance ( Components.interfaces.nsISupportsString );
                str.data = bprivacyutils.getPref ( "extensions.bprivacy.protectedLSOList" );
                bprivacyutils.prefsBP.setComplexValue ( "Exclusions", Components.interfaces.nsISupportsString, str );
                PrefSrv.clearUserPref ( "extensions.bprivacy.protectedLSOList" ); //delete preference
            }
        } catch ( e ){}
      //Protection list to regex
        try {
      var exclusions =  bprivacyutils.prefsBP.getComplexValue ( "Exclusions", Components.interfaces.nsISupportsString ).data;
            if ( exclusions && exclusions.length )
            {
          var protListarr = bprivacyutils.prefsBP.getComplexValue ( "Exclusions", Components.interfaces.nsISupportsString ).data.split ( "|" );
          for ( var x=0;x<protListarr.length;x++ )
          {
              var path = protListarr [ x ];
              if ( !path || !path.length )
                  continue;
              path  = bprivacy.RegExpEscape ( path );
              //var PreRandFolder    //do not add wildcards to existing exclusion paths
              protListarr [ x ] = path;
          }
          var str = Components.classes ["@mozilla.org/supports-string;1"].createInstance ( Components.interfaces.nsISupportsString );
          str.data = protListarr.join ( "|" );
          bprivacyutils.prefsBP.setComplexValue ( "Exclusions", Components.interfaces.nsISupportsString, str );
          protListarr = undefined;
            }
        } catch ( e ){}
        //initiated
        try {
          PrefSrv.clearUserPref ( "extensions.bprivacy.initiated" ); //delete preference
          bprivacyutils.setPref ( "extensions.bprivacy.initiated", Number ( initiated ),  64 );
        } catch ( e ){}
    },


    RegExpEscape: function ( str )
    {
        if ( /(\\\\|\\\/)/.test ( str ) )
            return str;
        str = str.replace ( /([\\])?([\\\^\$*+[\]?{}.=!:(|)\/\-])/g, function ( $0, $1, $2 ) { return $1 ? $0 : ( "\\" + $2 );  } );
        if ( !(/^([a-z]\\:|\.\*)/i).test( str ) )
            str = str.replace ( /^(.)/i, ".*$1" );
        return str;
    },


    init: function ()
    {
         // if ( !bprivacy.loaded && typeof bprivacyutils !== "undefined" ) {
          if ( !bprivacy.loaded ) {
              bprivacyutils.init();
              bprivacy.prompts = Components.classes ["@mozilla.org/embedcomp/prompt-service;1"].getService ( Components.interfaces.nsIPromptService );
              bprivacy.wm = Components.classes ["@mozilla.org/appshell/window-mediator;1"].getService ( Components.interfaces.nsIWindowMediator );
              bprivacy.nsIFilePicker = Components.interfaces.nsIFilePicker;
              bprivacy.mw = window.QueryInterface ( Components.interfaces.nsIInterfaceRequestor )
                               .getInterface ( Components.interfaces.nsIWebNavigation )
                               .QueryInterface ( Components.interfaces.nsIDocShellTreeItem )
                               .rootTreeItem
                               .QueryInterface ( Components.interfaces.nsIInterfaceRequestor )
                               .getInterface ( Components.interfaces.nsIDOMWindow );
             bprivacy.loaded = 1;
        }
    },


    //startup of FireFox
    firstload: function ( event )
    {
       try {
          Components.utils.import("resource://gre/modules/AddonManager.jsm");
          AddonManager.addAddonListener(bprivacyUninstallListener);
        } catch (ex) {}

        try {
            //window.removeEventListener ( "load", bprivacy.firstload, true );
           bprivacy.init ();

            var flashstate = bprivacyutils.getPref ( "extensions.bprivacy.flashstate" );
            if (flashstate > -1) {                                                 //-3: this function is disabled, -2: skip one times, -1: not initiated, 0-2 flash states
                bprivacyutils.setPref ( "plugin.state.flash", flashstate);          //restore user setting
                bprivacyutils.setPref ("extensions.bprivacy.flashstate", -1 );    //...but only once per  session
            }


            var initiated = bprivacyutils.getPref ( "extensions.bprivacy.initiated" );
            if ( typeof initiated === "boolean" )
                    bprivacy.convert ();      //bugfix: should be executed only once
                bprivacyPrefObserver.register();
                bprivacyObserver.register ("quit-application-requested");
                bprivacyObserver.register ("quit-application-granted");

                if ( !bprivacyutils.getPref ( "extensions.bprivacy.initiated" ) )
                {
                    bprivacyutils.setPref ( "extensions.bprivacy.initiated", 4,  64 );
                    bprivacyutils.setPref ( "browser.send_pings", false );
                    bprivacyutils.setPref ( "extensions.bprivacy.sendpings.allowed", false );
                    bprivacy.GetFlashDir (2);   //set flashApp directory preference, scan if necessary
                    setTimeout ( function () { bprivacy.openHelp ( 'chrome://bprivacy/content/BetterPrivacy.html' );}, 25000 );
                }
                else if ( bprivacyutils.getPref ( "extensions.bprivacy.initiated" ) < 4 && bprivacy.getFFMainVersion() > 41 )
                {
                    bprivacyutils.setPref ( "extensions.bprivacy.initiated", 4,  64 );
                    setTimeout ( function (){ bprivacy.openHelp ( 'chrome://bprivacy/content/BetterPrivacyUpdated.html' );}, 25000 );
                }
                else
                {
                    if ( bprivacyutils.getPref ( "extensions.bprivacy.alwaysReScan" ) || !bprivacy.GetFlashDir (0))
                        bprivacy.GetFlashDir (1);
                }

                if (
                    ( !bprivacyutils.getPref ( "extensions.bprivacy.sendpings.allowed" ) && ( bprivacyutils.getPref ( "extensions.bprivacy.sendpings.allowed" ) != bprivacyutils.getPref ( "browser.send_pings" )) )
                )
                {
                        bprivacyutils.setPref ( "browser.send_pings", bprivacyutils.getPref ( "extensions.bprivacy.sendpings.allowed" ));
                }
                if ( bprivacyutils.getPref ( "extensions.bprivacy.DelTimerInterval" ) < 1 )
                    bprivacyutils.setPref ( "extensions.bprivacy.DelTimerInterval", 1 );

                if ( window == bprivacy.mw )
                {
                    if ( bprivacyutils.getPref ( "extensions.bprivacy.AutoDelLSOnStart" ))  {
                          var enumerator = bprivacy.wm.getEnumerator ( "navigator:browser" );
                          var wincount = 0;
                          while ( wincount < 3 && enumerator && enumerator.hasMoreElements() ) {
                            wincount++;
                            enumerator.getNext ();
                          }
                          if ( wincount === 1 )
                                    bprivacy.prepareDelLSO ( 2, null );
                    }
                    bprivacy.startDelTimer ();
                }
                bprivacy.SetKeys ();
        } catch ( e ){ alert ( "An error occured while initializing BetterPrivacy\r\nPlease send the following information to the author: \r\n"+e ); Components.utils.reportError ( e );}
    },//end menue load






    SetKeys: function ()
    {
        var kNode = document.getElementById ( "bprivacy.delete_key" );
        if ( kNode )
        {
            var keyCode = bprivacyutils.getPref ( "extensions.bprivacy.keycode" );
            if ( keyCode ){
                kNode.setAttribute ( "disabled", false );
                kNode.setAttribute ( "modifiers", String ( bprivacyutils.getPref ( "extensions.bprivacy.keymodifiers" )));
                kNode.setAttribute ( "key", String.fromCharCode ( keyCode ));
            }
        }
    },





    GetDirs: function ( currentDir, dirArray )
    {
        var entries;
        try {
            entries = currentDir.directoryEntries;
        } catch ( e ){}
        while ( entries && entries.hasMoreElements ())
        {
            var entry = entries.getNext ();
            try {
                entry.QueryInterface ( Components.interfaces.nsIFile );
                if ( entry.isDirectory () && !entry.isSymlink () && !bprivacy.isSpecial ( entry ))
                {
                    dirArray.push ( entry );
                    bprivacy.GetDirs ( entry, dirArray );
                }
            } catch ( e ){ bprivacy.LOG ( "BetterPrivacy: Failure parsing directories - " + e );}
        }
        return dirArray;
    },




    DelDirSortAlgo: function ( file1, file2 )
    {
        if ( file1.path.length > file2.path.length )
        return -1;
        else if ( file2.path.length > file1.path.length )
        return 1;
        return 0;
    },



    delDirs: function ( FlashDirRoot )
    {
        if ( !FlashDirRoot || !bprivacyutils.getPref ( "extensions.bprivacy.delDirs" ))
            return;
          // Delete ISO8601 formated directories
        var dirArray = new Array ();
        bprivacy.GetDirs ( FlashDirRoot, dirArray );
        var numDirsToDelete = dirArray.length;
        dirArray.sort ( bprivacy.DelDirSortAlgo );
        for ( var i=0; i<numDirsToDelete; i++ )
        {
            try { //never delete non-empty directories ( FF throws NS_ERROR_FILE_DIR_NOT_EMPTY if remove attribut is false )
                dirArray[i].remove (false );
            } catch ( e )
            {
                if ( e.name != "NS_ERROR_FILE_DIR_NOT_EMPTY" )
                    bprivacy.LOG ( "BetterPrivacy: Unable to delete directory (usually temporarily due to an open handle or missing permission)- " + dirArray[i].path + " - " + e.name);
            }
        }
        dirArray = undefined;
    },



    onMainWinUnload: function ()      {
        bprivacy.mw.removeEventListener ("unload", bprivacy.onMainWinUnload, false);

        var  flashstate = bprivacyutils.getPref ( "extensions.bprivacy.flashstate" );
        if  ( flashstate > -3 ) {
          if ( flashstate == -2)
             bprivacyutils.setPref ( "extensions.bprivacy.flashstate", -1);  //uninstall/disable case
          else   if ( flashstate > -2 ) {
            bprivacyutils.setPref ( "extensions.bprivacy.flashstate", bprivacyutils.getPref ( "plugin.state.flash" ) );   //store user setting
            bprivacyutils.setPref ( "plugin.state.flash", 0 );   //disable plugin on FF exit =>prevent deletion of LSO's by FF
            }
        }


       //delete LSO's
       bprivacy.prepareDelLSO ( 3, null );
       bprivacyObserver.register("cookie-changed");
       bprivacy.handleSanitizeCookies (true, {});
    },




    onexit: function ()
    {
        bprivacy.init ();
        var time = bprivacy.tStart ? bprivacy.tStart : "";
        bprivacyutils.setPref ( "extensions.bprivacy.timer", time );



        try {
              bprivacy.mw.clearTimeout ( bprivacy.timerID );
              var enumerator = bprivacy.wm.getEnumerator ( "navigator:browser" );
              var wincount = 0;
              while ( wincount < 3 &&  enumerator && enumerator.hasMoreElements() ) {
                wincount++;
                enumerator.getNext ();
              }
              if ( wincount === 1 ) {
                  bprivacy.mw.addEventListener ("unload", bprivacy.onMainWinUnload, false);
              }
        } catch ( e ){ bprivacy.prompts.alert ( null, "BetterPrivacy", "BetterPrivacy\r\nError in shutdown procedure\r\nPlease report this to the author " + e ); Components.utils.reportError (e );  }
    },


    shouldHandleCookieClearing: function ( overrides )
    {
          if (!overrides)
              overrides = {};
          var FFVersion = (overrides.FFVersion !== undefined) ? overrides.FFVersion : bprivacy.getFFMainVersion();
          var sanitizeOnShutdown  = (overrides.sanitizeOnShutdown !== undefined) ? overrides.sanitizeOnShutdown : bprivacyutils.getPref ( "privacy.sanitize.sanitizeOnShutdown" );
          var clearCookiesOnShutdown  = (overrides.clearCookiesOnShutdown !== undefined) ? overrides.clearCookiesOnShutdown : bprivacyutils.getPref ( "privacy.clearOnShutdown.cookies" );
          var exclusions =  bprivacyutils.prefsBP.getComplexValue ( "Exclusions", Components.interfaces.nsISupportsString ).data;
          exclusions =  (overrides.exclusions !== undefined) ? overrides.exclusions : (!!exclusions && !!exclusions.length);
          var BPalwaysDeleteOnExit = (overrides.BPalwaysDeleteOnExit !== undefined) ? overrides.BPalwaysDeleteOnExit : (bprivacyutils.getPref ( "extensions.bprivacy.AutoDelLSOnExitMode" ) === 0 && bprivacyutils.getPref ( "extensions.bprivacy.donotaskonexit" ));
          var privatebrowsing  = (overrides.privatebrowsing !== undefined) ? overrides.privatebrowsing : bprivacyutils.getPref ( "browser.privatebrowsing.autostart" );
          var BPmanageLSOs = (overrides.BPmanageLSOs !== undefined) ? overrides.BPmanageLSOs : bprivacyutils.getPref ( "extensions.bprivacy.manageLSOs" );
          return ( FFVersion >= 5  && sanitizeOnShutdown && clearCookiesOnShutdown && (exclusions || !BPalwaysDeleteOnExit)  && BPmanageLSOs && !privatebrowsing );
    },


    checkFlashFolder: function ()
    {
        if ( !bprivacy.GetFlashDir (0))
        {
            if ( !bprivacyutils.getPref ( "extensions.bprivacy.donotaskforfolder" ))
            {
                var check = { value: false };
                var confirmed = bprivacy.prompts.confirmCheck ( null, "BetterPrivacy", bprivacy.getString ( "askfornewpath" ), bprivacy.getString ( "askfornewpath2" ), check );
                bprivacyutils.setPref ( "extensions.bprivacy.donotaskforfolder", check.value );
                if ( confirmed )
                    window.openDialog ( 'chrome://bprivacy/content/bprivacyopt.xul', '_blank', 'chrome=yes, modal=yes, resizable=yes, centerscreen=yes' );
            }
        }
        return bprivacy.GetFlashDir (0);
    },




    LSOtoDelete: function ()
    {
        bprivacy.lsos = [];
        if ( !bprivacy.checkFlashFolder ())
            return 0;
        bprivacy.LoadLsos ( bprivacy.GetFlashDir (0), true );
        var deleted = 0;
        for ( var x=0;x<bprivacy.lsos.length;x++ ) //first check number of LSO's to be deleted
        {
            try {
                var defaultCookie = bprivacy.isDefaultLSO ( bprivacy.lsos [x]);
                var protectedCookie = bprivacy.isProtectedLSO ( bprivacy.lsos [x]);
                if ( !protectedCookie && ( !defaultCookie || bprivacyutils.getPref ( "extensions.bprivacy.DefaultFlashCookieDeletion" )))
                    deleted++;
            } catch ( e ){ bprivacy.LOG ( "BetterPrivacy: Error while counting LSOs" );}
        }
        return deleted;
    },




    prepareDelLSO: function ( mode, trange )  //mode 1=byTimer 2=onStartup 3=onExit
    {
        try {
            if ( mode == 3 ) //on quit Firefox
            {
                if ( bprivacyutils.getPref ( "extensions.bprivacy.AutoDelLSOnExitMode" ) === 0 )  //BetterPrivacy deletion settings
                {
                    if ( !bprivacyutils.getPref ( "extensions.bprivacy.donotaskonexit" ))  //show dialog, ask user
                    {
                        window.openDialog ( "chrome://bprivacy/content/bprivacyprogress.xul", "_blank", "chrome=yes, modal=yes, resizable=no, centerscreen=yes, alwaysRaised=yes", mode );
                    } else    //no dialog
                    {
                        if ( bprivacy.LSOtoDelete ())
                            bprivacy.DelLSO ( mode, trange );
                    }
                }
                else if ( bprivacyutils.getPref ( "extensions.bprivacy.AutoDelLSOnExitMode" ) === 1 ) //Firefox automatic deletion settings (no sanitizer prompt)
                {
            var privacyitem, privacyclear, privacysanitize;
            try { privacysanitize = bprivacyutils.getPref ( "privacy.sanitize.sanitizeOnShutdown" );} catch ( e ){}
            try { privacyitem = bprivacyutils.getPref ( "privacy.item.extensions-betterprivacy" );} catch ( e ){}
            try { privacyclear = bprivacyutils.getPref ( "privacy.clearOnShutdown.extensions-betterprivacy" );} catch ( e ){}
                        if (  ! ( privacysanitize === true && ( ( privacyitem === true && !privacyclear ) ||  privacyclear === true ) )  )
                            return;
                        if ( bprivacy.LSOtoDelete ())
                            bprivacy.DelLSO ( mode, trange );
                }
            } else
            {
                if ( bprivacy.LSOtoDelete ())
                    bprivacy.DelLSO ( mode, trange );
            }
        } catch ( e ){ alert ( "BetterPrivacy: Error in prepare delete LSO function: " + e ); Components.utils.reportError ( e ); }
    },





    processProgressWindow: function ( win, mode ) //always mode 3
    {
        var deleted = bprivacy.LSOtoDelete ();
        if ( deleted )
        {
      win.blur ();
            var check = { value: false };
            var delconfirmed = bprivacy.prompts.confirmCheck ( null, bprivacy.getString ( "askfordeletion1" ), bprivacy.getString ( "askfordeletion2" ) + " " + deleted + " " + bprivacy.getString ( "askfordeletion3" ), bprivacy.getString ( "askfordeletion4" ), check );
            bprivacyutils.setPref ( "extensions.bprivacy.donotaskonexit", check.value );
            if ( delconfirmed )
                bprivacy.DelLSO ( mode, null );
        }
        win.close ();//keep open until here, else the processing might be aborted before finishing
    },


    DelLSO: function ( mode, range ) //mode 0=ClearHistory 1=byTimer 2=onStartup 3=onExit
    {
        try {
            deleted = 0;
            var DefaultLSOName = new RegExp ( bprivacyutils.getPref ( "extensions.bprivacy.DefaultLSOName" ), 'i' );
            for ( var x=0;x<bprivacy.lsos.length;x++ ) //effectively delete LSO's
            {
                    try {
                        var defaultCookie = bprivacy.isDefaultLSO ( bprivacy.lsos[x]);
                        var protectedCookie = bprivacy.isProtectedLSO ( bprivacy.lsos [x]);
                        var dir = String ( bprivacy.lsos [x].path ).replace ( DefaultLSOName, "" );
                        if ( !protectedCookie && ( !defaultCookie || bprivacyutils.getPref ( "extensions.bprivacy.DefaultFlashCookieDeletion" )))
                        {
                                var cDate = new Date ();
                                if ( mode == 1 && bprivacyutils.getPref ( "extensions.bprivacy.useDelTimerDelay" ) && cDate.getTime () >= bprivacy.lsos [x].file.lastModifiedTime && cDate.getTime () -bprivacy.lsos [x].file.lastModifiedTime < bprivacyutils.getPref ( "extensions.bprivacy.DelTimerInterval" ) * 1000 )
                                    continue;
                                if ( mode == 0 && range && cDate.getTime () >= bprivacy.lsos [x].file.lastModifiedTime && cDate.getTime () -bprivacy.lsos [x].file.lastModifiedTime > range )
                                    continue;
                    //bprivacy.LOG ( "BetterPrivacy: Deleting LSO (1) " + bprivacy.lsos [x].ident + ",  " + bprivacy.lsos [x].path + ",  " + bprivacy.lsos [x].prot );
                                bprivacy.lsos [x].file.remove ( false );
                                deleted++;
                        }
                    } catch ( e ){ bprivacy.LOG ( "BetterPrivacy: Error while deleting LSO" );}
            }
            bprivacyutils.setPref ( "extensions.bprivacy.removed", bprivacyutils.getPref ( "extensions.bprivacy.removed" ) + deleted );//statistics
            bprivacyutils.setPref ( "extensions.bprivacy.removedSession", bprivacyutils.getPref ( "extensions.bprivacy.removedSession" ) + deleted );//statistics
            bprivacy.delDirs ( bprivacy.GetFlashDir (0)); //remove folders
            bprivacy.updateKnownLSOs ();
        } catch ( e ){ alert ( "BetterPrivacy: Error in delete LSO function: " + e ); Components.utils.reportError (e ); }
    },


    updateKnownLSOs: function ()
    {
        if ( bprivacy.lsos )
            bprivacyutils.setPref ( "extensions.bprivacy.LSOcount", bprivacy.lsos.length );
    },




    modifiedSince: function ( lso )
    {
        var c = new Date (); //will hold current ticks
        var m = new Date ();
        m.setTime ( parseInt ( lso.modified )); //modified lso ticks
        var diff = c.getTime () - m.getTime ();
        return diff;
    },


    startDelTimer: function ()
    {
              var tCurrent = new Date ();
              bprivacy.tStart = new Date ();
              var Timer = bprivacyutils.getPref ( "extensions.bprivacy.timer" );
              if ( Timer ){
               var tTimer = new Date ( Timer );
                     if ( tTimer < tCurrent )
                          bprivacy.tStart = tTimer;
              }
              bprivacy.updateDelTimer ( true );
    },




    updateDelTimer: function ( initiated )
    {
                if ( bprivacyutils.getPref ( "extensions.bprivacy.NotifyOnNewLSO" ))
            {
                      if ( FlashDirRoot = bprivacy.GetFlashDir (0))
                      {
                        bprivacy.lsos = [];
                        bprivacy.LoadLsos ( FlashDirRoot, false );
                        if ( !initiated && bprivacyutils.getPref ( "extensions.bprivacy.NotifyOnNewLSO" ) == 1 && bprivacy.lsos.length > bprivacyutils.getPref ( "extensions.bprivacy.LSOcount" ))
                        {
                          var count = bprivacy.lsos.length - bprivacyutils.getPref ( "extensions.bprivacy.LSOcount" );
                          var str = count > 1 ? " LSO's have" : " LSO has";
                          var message = "BetterPrivacy detected that " + count + str + " been placed on your harddisk!";
                          bprivacy.NotifyNewLSO ( bprivacy.hashString ( message ), message );
                        } else
                          bprivacyutils.setPref ( "extensions.bprivacy.NotifyOnNewLSO", 1 );
                        bprivacy.updateKnownLSOs ();
                      }
            }
            if ( bprivacy.timerID )
                   clearTimeout ( bprivacy.timerID );
            if ( bprivacyutils.getPref ( "extensions.bprivacy.useDelTimer" ))
                {
                        if ( !bprivacy.tStart )
                          bprivacy.tStart = new Date ();
                        var tDate = new Date ();
                        tDate.setTime ( tDate.getTime () - bprivacy.tStart.getTime ());
                        if ( tDate.getTime () / ( bprivacyutils.getPref ( "extensions.bprivacy.DelTimerInterval" ) * 1000 ) >= 1 ){
                          bprivacy.prepareDelLSO (1, null );
                          bprivacy.tStart = null;
                        }
            } else {
                        bprivacy.tStart = null;
            }
            //bprivacy.timerID = setTimeout ( "bprivacy.updateDelTimer ()", 1000 );
            bprivacy.timerID = setTimeout ( function (){ bprivacy.updateDelTimer ();}, 1000 );

    },


    sortMultiDimensional: function ( a,b )
    {
        // this sorts the array using the second element
        return (( a [1] < b [1]) ? -1 : (( a [1] > b [1]) ? 1 : 0 ));
    },


    NotifyNewLSO: function ( value, message )
    {
        var c = new Date ();
        var mins = c.getMinutes ();
        if ( mins < 10 )
            mins = "0" + mins;
        var secs = c.getSeconds ();
        if ( secs < 10 )
            secs = "0" + secs;
        var ModifiedLSOs = "    Timestamp: " + c.getHours () + ":" + mins + ":" + secs;
        var count = 0;
        for ( var x=0;x<bprivacy.lsos.length;x++ )
        {
            if ( bprivacy.modifiedSince ( bprivacy.lsos [x]) < 2000 )
            {
                if ( !count )
                    ModifiedLSOs += '    Last modified:';
                ModifiedLSOs += ' "' + bprivacy.lsos [x].file.leafName + '"';
                count++;
            }
        }
        bprivacy.Notification ( value, message + ModifiedLSOs );
    },



    Notification: function ( value, message )
    {
      var buttons = [{ label: "View LSOs",
     callback: function () { bprivacy.RemoveNotification ( value ); bprivacy.showBetterPrivacy (); },
     accessKey: null, popup: null }];
      var nbox = window.getBrowser ().getNotificationBox ();
        nbox.appendNotification ( message, value, "chrome://bprivacy/content/pie.png", bprivacyutils.getPref ( "extensions.bprivacy.NotifyPriority" ), buttons );
        if ( bprivacyutils.getPref ( "extensions.bprivacy.NotifyDuration" ))
            setTimeout ( function (){ bprivacy.RemoveNotification ( value )}, bprivacyutils.getPref ( "extensions.bprivacy.NotifyDuration" ) * 1000, value );
    },


    RemoveNotification: function ( value )
    {
        if ( item = window.getBrowser ().getNotificationBox ().getNotificationWithValue ( value ))
            window.getBrowser ().getNotificationBox ().removeNotification ( item );
    },


    changeAppDir: function ( event )
    {
        bprivacy.Scan = -1;
        if ( event )
        {
            if ( event.keyCode != 13 )
                return;
            var newpath = bprivacy.getDoc ().getElementById ( "appdir" ).value;

            var oldDir;
            try {
                oldDir = bprivacyutils.prefsBP.getComplexValue ( "DataDir", Components.interfaces.nsILocalFile );
            } catch ( e ){}

            if ( oldDir && newpath == oldDir.path )
                return;
            if ( !confirm ( "BetterPrivacy:\r\nYou changed the FlashApplication folder to: \r\n" + newpath + "\r\nDo you want to apply this modification?" ))
            {
                if ( oldDir )
                    newpath = oldDir.path;
                else
                    newpath = "";
                bprivacy.getDoc ().getElementById ( "appdir" ).value = newpath;
            }
            var Dir = Components.classes ["@mozilla.org/file/local;1"].createInstance ( Components.interfaces.nsILocalFile );
            try {
                  Dir.initWithPath ( newpath );
                newpath = Dir;
                  if ( !Dir.path || !Dir.exists () || !Dir.isDirectory ())
                    newpath = null;
            } catch ( e ){ newpath = null;}
        } else
        {
      var fp = Components.classes ["@mozilla.org/filepicker;1"].createInstance ( bprivacy.nsIFilePicker );
            fp.init ( window, bprivacy.getString ( "selectDirTitle" ), bprivacy.nsIFilePicker.modeGetFolder );
            var rv = fp.show ();
            if (( rv != bprivacy.nsIFilePicker.returnOK ) && ( rv != bprivacy.nsIFilePicker.returnReplace ))
                return;
            var newpath = fp.file;
        }
        if ( newpath )
            bprivacyutils.prefsBP.setComplexValue ( "DataDir", Components.interfaces.nsILocalFile, newpath );
        bprivacy.LSOTreeShow ( newpath );
        return true;
    },



    searchDir: function ()
    {

        if ( bprivacy.getDoc ().getElementById ( "searchFolderID" ).label != bprivacy.getString ( "abort" )){
            if ( FlashDir = bprivacy.GetFlashDir (2 ))
                bprivacy.LSOTreeShow ( FlashDir );
        } else {
            bprivacy.Scan = -1;
        }
    },



    treeView:
    {
        treeBox: null,
        selection: null,
        get rowCount ()                       { return bprivacy.lsos.length; },
        setTree: function ( treeBox )         { this.treeBox = treeBox; },
        isSeparator: function ( idx )         { return false; },
        isSorted: function ()               { return false; },
        isEditable: function ( idx, column )  { return false; },
        getCellProperties: function ( idx, column, prop ) {},
        getColumnProperties: function ( column, element, prop ) {},
        getRowProperties: function ( row, element, prop ) {},
        getImageSrc: function () { return null;},
        isContainer: function () { return false;},
        cycleHeader: function () {},
         getCellText: function ( idx, column )
        {
            if ( !bprivacy.lsos.length )
                return "";
            else if ( column.id=="ident" )
                return bprivacy.lsos [ idx].ident;
            else if ( column.id=="name" )
                return bprivacy.lsos [idx].file.leafName;
            else if ( column.id=="size" )
                return bprivacy.lsos [ idx].size;
            else if ( column.id=="modified" )
            {
                var cDate = new Date ();
                cDate.setTime ( parseInt ( bprivacy.lsos [idx].modified ));
                return cDate.toLocaleString ();
            }
            else if ( column.id=="prot" )
            {
                if ( bprivacy.lsos [idx].prot.indexOf ( "d" ) < 0 && bprivacy.lsos [idx].prot.indexOf ( "s" ) < 0 )
                    return bprivacy.getString ( "unprotected" );
                else if ( bprivacy.lsos [idx].prot.indexOf ( "d" ) >= 0 )
                    return bprivacy.getString ( "protectedFolder" );
                else if ( bprivacy.lsos [idx].prot.indexOf ( "s" ) >= 0 )
                    return bprivacy.getString ( "protectedSubFolder" );
            }
            return "";
        },
    },




    LSOTreeShow: function ( flashDir )
    {
        var cDate = new Date ();
        if ( !flashDir )
        {
            // Display error if selected directory does not exist
            bprivacy.getDoc ().getElementById ( "appdir" ).setAttribute ( "readonly","true" );
            bprivacy.getDoc ().getElementById ( "appdir" ).value = bprivacy.getString ( "dirNotFound" );
            bprivacy.getDoc ().getElementById ( "appdir" ).style.backgroundColor = "red";
            bprivacy.getDoc ().getElementById ( "appdir" ).style.color = "white";
            bprivacy.getDoc ().getElementById ( "searchFolderID" ).label = bprivacy.getString ( "searchFlashFolder" );
            bprivacy.getDoc ().getElementById ( "lsoinfo" ).value = "";
            bprivacy.getDoc ().getElementById ( "tip" ).value = "Status " + cDate.toLocaleString ();
        }
        else
        {
            bprivacy.getDoc ().getElementById ( "appdir" ).removeAttribute ( "readonly" );
            bprivacy.getDoc ().getElementById ( "appdir" ).value = flashDir.path;
            bprivacy.getDoc ().getElementById ( "appdir" ).style.backgroundColor = "";
            bprivacy.getDoc ().getElementById ( "appdir" ).style.color = "";
            bprivacy.getDoc ().getElementById ( "searchFolderID" ).label = bprivacy.getString ( "searchFlashFolder" );
            bprivacy.getDoc ().getElementById ( "lsoinfo" ).value = bprivacy.getString ( "listLSOs" );
            bprivacy.getDoc ().getElementById ( "tip" ).value = "Status " + cDate.toLocaleString ();
        }
        setTimeout ( function (){ bprivacy.LoadLsosIntoTree ( flashDir );}, 500, flashDir ); //provide time to update GUI
    },



    LoadLsosIntoTree: function ( flashDir )
    {
        bprivacy.lsos = [];
        if ( flashDir )
            bprivacy.LoadLsos ( flashDir, true );
    bprivacy.updateGUI ( true, true );
    bprivacy.TreeOnSelect ();
    },



    ReloadLsos: function ()
    {
        bprivacy.LSOTreeShow ( bprivacy.GetFlashDir (0 ));
    },


    //updateGUI: function ( flashDir, sort )
    updateGUI: function ( sort, view )
    {
        var LSOTree = bprivacy.getDoc ().getElementById ( "LSOViewerTree" );
        if ( !LSOTree )
            return;
        if ( view )
              LSOTree.view = bprivacy.treeView;
        bprivacy.updateKnownLSOs ();
        bprivacy.getDoc ().getElementById ( "lso_removed" ).value = bprivacyutils.getPref ( "extensions.bprivacy.removed" );
        bprivacy.getDoc ().getElementById ( "lso_removedSession" ).value = bprivacyutils.getPref ( "extensions.bprivacy.removedSession" );
        bprivacy.getDoc ().getElementById ( "removeAllLsos" ).disabled = bprivacy.lsos.length == 0;
        bprivacy.getDoc ().getElementById ( "lsoinfo" ).value = "";
        if ( sort )
            bprivacy.SortLSOView ( null );
        else
            LSOTree.treeBoxObject.invalidate ();
    },


    TreeOnSelect: function ()
    {
        var LSOTree = bprivacy.getDoc ().getElementById ( "LSOViewerTree" );
        if ( !LSOTree )
            return;
        if ( LSOTree.currentIndex < 0 || !bprivacy.lsos [LSOTree.currentIndex ])
        {
            bprivacy.getDoc ().getElementById ( "FullPathID" ).value = bprivacy.getString ( "nothingselected" );
            bprivacy.getDoc ().getElementById ( "protectLsoDir" ).label = bprivacy.getString ( "protectDir" );
            bprivacy.getDoc ().getElementById ( "removeLso" ).disabled = true;
            bprivacy.getDoc ().getElementById ( "protectLsoDir" ).disabled = true;
            return;
        }
        //save selection
        bprivacy.selected = bprivacy.lsos [LSOTree.currentIndex ].path;
        bprivacy.getDoc ().getElementById ( "removeLso" ).removeAttribute ( "disabled" );
        bprivacy.getDoc ().getElementById ( "protectLsoDir" ).removeAttribute ( "disabled" );
        bprivacy.getDoc ().getElementById ( "FullPathID" ).value = bprivacy.lsos [LSOTree.currentIndex ].path;
    var protState = bprivacy.lsos [LSOTree.currentIndex ].prot;
        if ( protState.indexOf ( "d" ) >= 0 || protState.indexOf ( "s" ) >= 0 )
            bprivacy.getDoc ().getElementById ( "protectLsoDir" ).label = bprivacy.getString ( "unprotectDir" );
        else
            bprivacy.getDoc ().getElementById ( "protectLsoDir" ).label = bprivacy.getString ( "protectDir" );
    },






    RefreshLSOProtection: function ()
    {
        for ( var i=0; i<bprivacy.lsos.length; i++ )
            bprivacy.lsos [i ].prot = bprivacy.getLSOProtection ( bprivacy.lsos [i].file );
    },




    LoadLsos: function ( currentDir, doFootprint )
    {
        var protListarr = bprivacyutils.prefsBP.getComplexValue ( "Exclusions", Components.interfaces.nsISupportsString ).data.split ( "|" );
        var entries;
        try {
        entries = currentDir.directoryEntries;
        } catch ( e ){}
        if ( !entries )
            bprivacy.LOG ( "BetterPrivacy Warning: A LSO folder is inaccessable: " + currentDir.path );
        var FlashDirRegEx = new RegExp ( '.*'+bprivacyutils.getPref ( "extensions.bprivacy.FlashDirRegEx" ), 'i' );
        var DefaultLSORegEx = new RegExp ( bprivacyutils.getPref ( "extensions.bprivacy.DefaultLSORegEx" ) + "[\\\\\\/]+", 'i' );
        while ( entries && entries.hasMoreElements ())
        {
            try {
                var entry = entries.getNext ();
                entry.QueryInterface ( Components.interfaces.nsIFile );
                if ( entry.isFile () && !entry.isSymlink () && !bprivacy.isSpecial ( entry ))
                {
                    try {
                        if ( bprivacy.isLSO ( entry, doFootprint ))
                        {
                            var cDate = new Date ();
                            var ticks = cDate.getTime ();
                            var modified = ticks-entry.lastModifiedTime;
                            var prot = bprivacy.getLSOProtection ( entry );
                            var ident = entry.path;
              ident = ident.replace ( FlashDirRegEx, "" );
              ident = String ( ident ).replace ( DefaultLSORegEx, "" );
                            ident = String ( ident ).match (/[^\\\/]+\.[^\\\/]+/, "" );
                            ident = String ( ident ).replace (/^[#]/, "" );
                            bprivacy.lsos [bprivacy.lsos.length] = new bprivacy.Lso ( entry, ident, entry.fileSize, entry.path, prot, String ( ticks - modified ) );
                        }
                    } catch ( e ){ bprivacy.LOG ( "BetterPrivacy: An error occured while scanning folders for LSO data: " + e );}
                }
                else if ( entry.isDirectory () && !entry.isSymlink () && !bprivacy.isSpecial ( entry )){
                    bprivacy.LoadLsos ( entry, doFootprint );
                }
            } catch ( e ){ bprivacy.LOG ( "BetterPrivacy: Error while scanning folders for LSO data" + e );}
        }
        protListarr = null;
    },




    Lso: function ( entry, ident, size, path, prot, modified )
    {
        this.file = entry;
        this.ident = ident;
        this.name = entry.leafName;
        this.size = size;
        this.path = path;
        this.prot = prot;
        this.modified = modified;
    if ( bprivacy.isDefaultLSO ( this ))
            this.ident = "<default LSO>";
    else if ( bprivacy.isSettingsLSO ( this ))
            this.ident = ident + " <settings LSO>";
    else if ( ident.substring ( ident.length-4 ) === ".sol" )
            this.ident = "<local LSO>";
        return this;
    },


    isLSO: function ( item, doFootprint )
    {
        if (bprivacyutils.getPref ( "extensions.bprivacy.disableFootprintCheck" ))
                return true;
        var str;
        var dotIndex  = item.leafName.lastIndexOf ( '.' );
        var extension = ( dotIndex >= 0 ) ? item.leafName.substring ( dotIndex+1 ) : "";
        if ( extension.toLowerCase () != bprivacyutils.getPref ( "extensions.bprivacy.LSOExtension" ).toLowerCase ())
              return false;
        if ( doFootprint )
        {
            var file = Components.classes ["@mozilla.org/file/local;1"].createInstance ( Components.interfaces.nsILocalFile );
            try {
                        file.initWithPath ( item.path );
                        if ( file.exists ())
                        {
                            var hfp = bprivacyutils.getPref ( "extensions.bprivacy.LSOHexFootprint" ).split ( "|" );//get hexfootprint
                            var istream = Components.classes ["@mozilla.org/network/file-input-stream;1"].createInstance ( Components.interfaces.nsIFileInputStream );
                            var bstream = Components.classes ["@mozilla.org/binaryinputstream;1"].createInstance ( Components.interfaces.nsIBinaryInputStream );
                            try {
                               istream.init ( file, 0x01, 0400, 1<<2 );
                               bstream.setInputStream ( istream );
                               str = String ( bstream.readBytes ( bstream.available () > hfp.length ? hfp.length : bstream.available ()));//only read needed bytes
                            } catch ( e ){ bprivacy.LOG ( "BetterPrivacy: HexFootPrint error 1 " + e ); return false;}
                            bstream.close ();
                            istream.close ();
                            if ( str && str.length >= hfp.length )
                            {
                               for ( var i = 0; i < hfp.length; i++ ) {
                                                if ( hfp [i].length && str.charCodeAt (i) != hfp [i]) { //compare
                                                        str = undefined;
                                                  return false;
                                                }
                                }
                            } else {
                                str = undefined;
                              return false;
                            }
                        }
                        str = undefined;
            } catch ( e ){ bprivacy.LOG ( "BetterPrivacy: HexFootPrint error 2 " + e ); return false;}
        }
        return true;
    },





    FindLSORoot: function ( HomeDir, ExToFind )
    {
        if ( bprivacy.Stack.length > 0 )
            return; //important
        bprivacy.Stack [0 ] = HomeDir;
        bprivacy.Scan = 1;
        bprivacy.FindLSORootNonRecursive ( ExToFind, 1 );
    },


    FindLSORootNonRecursive: function ( ExToFind,  done )
    {
        var finish = function ( newdir ){
            bprivacy.LSOTreeShow ( newdir );
            bprivacy.Scan = 0;
            bprivacy.Stack = [];
        }
        var currentDir = bprivacy.Stack.pop ();
        if ( ExToFind.test ( currentDir.leafName ))
        {
            var Dir = Components.classes ["@mozilla.org/file/local;1"].createInstance ( Components.interfaces.nsILocalFile );
            try {
                  Dir.initWithPath ( currentDir.path );
                  if ( Dir.path && Dir.exists () && Dir.isDirectory ())
                    bprivacyutils.prefsBP.setComplexValue ( "DataDir", Components.interfaces.nsILocalFile, Dir );
                else
                    Dir = null;
            } catch ( e ){ Dir = null;}

            finish ( Dir );
            return;
        }
        done++;
        var entries;
        try {
            entries = currentDir.directoryEntries;
        } catch ( e ){}
        while ( entries && entries.hasMoreElements () && bprivacy.Scan > 0 )
        {
            var entry = entries.getNext ();
            entry.QueryInterface ( Components.interfaces.nsIFile );
            if ( entry.isDirectory () && !entry.isSymlink () && !bprivacy.isSpecial ( entry ))
                bprivacy.Stack.push ( entry );
        }
         if ( bprivacy.Scan > 0 && bprivacy.Stack.length > 0 ){
            //GUI
            if ( bprivacy.getDoc ().getElementById ( "lsoinfo" ))
                bprivacy.getDoc ().getElementById ( "lsoinfo" ).value = bprivacy.getString ( "LSOFolderScan" ) + " ["+done+"]";
            if ( bprivacy.getDoc ().getElementById ( "searchFolderID" ))
                bprivacy.getDoc ().getElementById ( "searchFolderID" ).label = bprivacy.getString ( "abort" );
            //GUI-end
            setTimeout ( function (){ bprivacy.FindLSORootNonRecursive ( ExToFind, done )}, 1, ExToFind, done );
        } else {
            if ( bprivacy.Scan > 0 && bprivacy.getDoc ().getElementById ( "lsoinfo" ))
                bprivacy.getDoc ().getElementById ( "lsoinfo" ).value = bprivacy.getString ( "NoDirFound" );
            finish ( bprivacy.GetFlashDir (0 ));
        }
    },



    isSpecial: function ( entry )
    {
        try {
            return entry.isSpecial ();
        } catch ( e ){}
        return false; //no avail on Mac
    },



    isDefaultLSO: function ( lso )
    {
    var DefaultLSORegEx = bprivacyutils.getPref ( "extensions.bprivacy.DefaultLSORegEx" ) + "[\\\\\\/]+?$";
        var DefaultLSORegEx = new RegExp ( DefaultLSORegEx, 'i' );
        var DefaultLSOName = new RegExp ( bprivacyutils.getPref ( "extensions.bprivacy.DefaultLSOName" ), 'i' );
        var dir = String ( lso.path ).replace ( DefaultLSOName, "" );
        if ( lso.file.leafName.match ( DefaultLSOName ) && dir.match ( DefaultLSORegEx ) )
              return true;
        return false;
    },


    isSettingsLSO: function ( lso )
    {
    var SettingsLSORegEx = bprivacyutils.getPref ( "extensions.bprivacy.DefaultLSORegEx" ) + "[\\\\\\/]+.+";
        var SettingsLSORegEx = new RegExp ( SettingsLSORegEx, 'i' );
        var dir = String ( lso.path );
        if ( dir.match ( SettingsLSORegEx ) )
              return true;
        return false;
    },


    isProtectedLSO: function ( lso )
    {
        if ( String ( lso.prot ).indexOf ( "d" ) >= 0 || String ( lso.prot ).indexOf ( "s" ) >= 0 )
            return true;
        return false;
    },

    getLSOProtection: function ( entry )
    {
        var leafRegEx = new RegExp ( entry.leafName, 'i' );
        var path = entry.path.replace ( leafRegEx, "" );
        path = path.replace (/[\\\/]+$/i, "" );

        var prot = "";
        var protListarr = bprivacyutils.prefsBP.getComplexValue ( "Exclusions", Components.interfaces.nsISupportsString ).data.split ( "|" );
        var FlashDirRegEx = new RegExp ( '^.*'+bprivacyutils.getPref ( "extensions.bprivacy.FlashDirRegEx" ), 'i' );

        if ( bprivacyutils.getPref ( "extensions.bprivacy.alwaysReScan" ))
        path = path.replace ( FlashDirRegEx, "" );
        for ( var x=0;x<protListarr.length;x++ )
        {
            if ( !String ( protListarr [x]).length )
                continue;
            var protdir = protListarr [x];
            if ( bprivacyutils.getPref ( "extensions.bprivacy.alwaysReScan" ))
                protdir = protdir.replace ( FlashDirRegEx, "" );
      //alert ( path+' \r\n '+protdir );
      var folderMatchRegEx = new RegExp ( "^" + protdir + "[\\\\\\/]*$", "" );
      var subfolderMatchRegEx = new RegExp ( "^" + protdir + "[\\\\\\/]+.+", "" );
      //alert ( folderMatchRegEx+'\r\n'+subfolderMatchRegEx );
            if ( path.match ( folderMatchRegEx ) ) {
                prot = "d";
                break;
            } else if ( bprivacyutils.getPref ( "extensions.bprivacy.autosubfolders" ) && path.match ( subfolderMatchRegEx ) ) {
                prot = "s";
            }
        }
        return prot;
    },




    RemoveFromLSOProtection: function ( path )
    {
        var exp = new RegExp ( '^.*'+bprivacyutils.getPref ( "extensions.bprivacy.FlashDirRegEx" ), 'i' );
        if ( bprivacyutils.getPref ( "extensions.bprivacy.alwaysReScan" ))
            path = path.replace ( exp, "" );

        var protListarr = bprivacyutils.prefsBP.getComplexValue ( "Exclusions", Components.interfaces.nsISupportsString ).data.split ( "|" );
        for ( var x=0;x<protListarr.length;x++ )
        {
            var protDirRgx = protListarr [x];
            if ( bprivacyutils.getPref ( "extensions.bprivacy.alwaysReScan" ))
                protDirRgx = protDirRgx.replace ( exp, "" );
      var folderMatchRegEx = new RegExp ( "^" + protDirRgx + "(\u005c\u002f|\u005c\u005c)?$", "" );
       //alert ( folderMatchRegEx );
            if ( path.match ( folderMatchRegEx ) )
                protListarr.splice ( x, 1 );
        }

        var str = Components.classes ["@mozilla.org/supports-string;1"].createInstance ( Components.interfaces.nsISupportsString );
        str.data = protListarr.join ( "|" );
        bprivacyutils.prefsBP.setComplexValue ( "Exclusions", Components.interfaces.nsISupportsString, str );
        protListarr = undefined;
    },



    AddToLSOProtection: function ( path )
    {
        var protListarr = bprivacyutils.prefsBP.getComplexValue ( "Exclusions", Components.interfaces.nsISupportsString ).data.split ( "|" );
    if ( bprivacy.isProtectedPath ( path, protListarr ) ) {
                protListarr = undefined;
        return;
    }
    path  = bprivacy.RegExpEscape ( path );
    var PreRandFolder = bprivacyutils.getPref ( "extensions.bprivacy.PreRandFolder" );
        var RandFolderRegEx = new RegExp ( "([\\\\\\/]+)" + PreRandFolder + "([\\\\\\/]+)" + "[^\\\\\\\/]+", "" );
    //alert ( RandFolderRegEx+'\r\n'+path );
        path = path.replace ( RandFolderRegEx, "$1" + PreRandFolder + "$2" + "[^\\\\\\/]+"    );

        protListarr.push ( path );
        var str = Components.classes ["@mozilla.org/supports-string;1"].createInstance ( Components.interfaces.nsISupportsString );
        str.data = protListarr.join ( "|" );
        bprivacyutils.prefsBP.setComplexValue ( "Exclusions", Components.interfaces.nsISupportsString, str );
        protListarr = undefined;
    },


  isProtectedPath: function ( path, protListarr ) {
        for ( var x=0;x<protListarr.length;x++ )
        {
      var folderMatchRegEx = new RegExp ( "^" + protListarr [x] + "[\\\\\\/]*$", "" );
      var subfolderMatchRegEx = new RegExp ( "^" + protListarr [x] + "[\\\\\\/]+.+", "" );
            if ( ( folderMatchRegEx ).test ( path ) /*|| ( subfolderMatchRegEx ).test ( path ) */ )
                return true;
        }
    return false;
  },


    ToggleLSOProtection: function ()
    {
        var LSOTree = bprivacy.getDoc ().getElementById ( "LSOViewerTree" );
        if ( LSOTree.currentIndex < 0 )
            return;
        var toModify = LSOTree.currentIndex;
        var path = bprivacy.lsos [toModify].path;

        var exp = new RegExp ( bprivacy.lsos [toModify].file.leafName, 'i' );
        path = path.replace ( exp, "" );
        path = path.replace (/[\\\/]+$/i, "" );
    if ( bprivacy.lsos [toModify].prot.indexOf ( "s" ) >= 0 )
        {
                var confirmed = bprivacy.prompts.confirm ( window, "BetterPrivacy", bprivacy.getString ( "askprotectsubfolders" ));
                if ( confirmed )
          bprivacyutils.setPref ( "extensions.bprivacy.autosubfolders", false );
        }
        else if ( bprivacy.lsos [toModify].prot.indexOf ( "d" ) < 0 )
    {
            bprivacy.AddToLSOProtection ( path );
            bprivacy.lsos [toModify].prot = "d";
        } else
    {
            bprivacy.RemoveFromLSOProtection ( path );
            bprivacy.lsos [toModify].prot = bprivacy.lsos [toModify].prot.replace (/d/g, "" );
        }

        bprivacy.RefreshLSOProtection ();
        bprivacy.updateGUI ( false );
        bprivacy.TreeOnSelect ();
    },



    DeleteLso: function ()
    {
        var LSOTree = bprivacy.getDoc ().getElementById ( "LSOViewerTree" );
        if ( !bprivacy.lsos [LSOTree.currentIndex])
            return;
        try {
            if ( bprivacy.lsos [LSOTree.currentIndex].file.exists ())  {
        //bprivacy.LOG ( "BetterPrivacy: Deleting LSO (2) " + bprivacy.lsos [LSOTree.currentIndex].ident + ",  " + bprivacy.lsos [LSOTree.currentIndex].path + ",  " + bprivacy.lsos [LSOTree.currentIndex].prot );
                bprivacy.lsos [LSOTree.currentIndex].file.remove (false );
            } else
                alert ( "BetterPrivacy: This file does not exist anymore, nothing to do" );
        } catch ( e ){ alert ( "BetterPrivacy error: Failed to delete that file!" ); Components.utils.reportError ( e ); return;}
    bprivacy.lsos.splice ( LSOTree.currentIndex , 1 );
    LSOTree.treeBoxObject.rowCountChanged ( LSOTree.currentIndex + 1 , -1 );
        bprivacy.updateGUI (false );
        bprivacy.TreeOnSelect ();
        bprivacy.delDirs ( bprivacy.GetFlashDir (0));
    },


    DeleteAllLsos: function ()
    {
        var LSOTree = bprivacy.getDoc ().getElementById ( "LSOViewerTree" );
        var protectedCookie = false;
        var button = 0;
        var check = {value: false };
        for ( var x=0;x<bprivacy.lsos.length;x++ )
        {
            if ( String ( bprivacy.lsos [x].prot ).indexOf ( "d" ) >= 0 || String ( bprivacy.lsos [x].prot ).indexOf ( "s" ) >= 0 ){
                protectedCookie = true;
                break;
            }
        }
        if ( protectedCookie )
        {
            var flags = bprivacy.prompts.BUTTON_POS_0 * bprivacy.prompts.BUTTON_TITLE_YES +
                        bprivacy.prompts.BUTTON_POS_1 * bprivacy.prompts.BUTTON_TITLE_NO  +
                        bprivacy.prompts.BUTTON_POS_2 * bprivacy.prompts.BUTTON_TITLE_CANCEL;
            button = bprivacy.prompts.confirmEx ( null, "BetterPrivacy", bprivacy.getString ( "asktodeleteall" ), flags, "", "", "", bprivacy.getString ( "asktodeleteallcheck" ), check );
            if ( button === 2 )
                return;
        }
        var deleted = 0;
        for ( var x=0;x<bprivacy.lsos.length;x++ )
        {
            protectedCookie = false;
            if ( String ( bprivacy.lsos [x].prot ).indexOf ( "d" ) >= 0 || String ( bprivacy.lsos [x].prot ).indexOf ( "s" ) >= 0 )
                protectedCookie = true;
            try {
                if ( ! ( button === 1 && protectedCookie === true ) ) {
          if ( check.value === true && bprivacy.getLSOProtection ( bprivacy.lsos [x].file ) === "d" )  {
              var path = bprivacy.lsos [x].path;
              var exp = new RegExp ( bprivacy.lsos [x].file.leafName, 'i' );
              path = path.replace ( exp, "" );
              path = path.replace (/[\\\/]+$/i, "" );
              bprivacy.RemoveFromLSOProtection ( path );
          }
          //bprivacy.LOG ( "BetterPrivacy: Deleting LSO (3 ) " + bprivacy.lsos [x].ident + ",  " + bprivacy.lsos [x].path + ",  " + bprivacy.lsos [x].prot );
          bprivacy.lsos [x].file.remove (false );
          deleted++;
                }
            } catch ( e ){ alert ( "BetterPrivacy\r\nError while deleting file: " + e ); Components.utils.reportError ( e ); }
        }
        if ( deleted ) {
            bprivacy.LSOTreeShow ( bprivacy.GetFlashDir (0));
            bprivacy.TreeOnSelect ();
            bprivacy.delDirs ( bprivacy.GetFlashDir (0));
        }
    },




    GetRootDir: function ( platform )
    {
        switch ( platform ){
        case "windows":
            return ( Components.classes ["@mozilla.org/file/directory_service;1"].getService ( Components.interfaces.nsIProperties ).get ( "AppData", Components.interfaces.nsILocalFile ));
        break;
        case "mac1":
            return ( Components.classes ["@mozilla.org/file/directory_service;1"].getService ( Components.interfaces.nsIProperties ).get ( "ULibDir", Components.interfaces.nsILocalFile ));
        break;
        case "mac2":
            return ( Components.classes ["@mozilla.org/file/directory_service;1"].getService ( Components.interfaces.nsIProperties ).get ( "UsrPrfs", Components.interfaces.nsILocalFile ));
        break;
        case "linux":
            //gets user-directory
            return ( Components.classes ["@mozilla.org/file/directory_service;1"].getService ( Components.interfaces.nsIProperties ).get ( "Home", Components.interfaces.nsILocalFile ));
        break;
        }
        return null;
    },



    GetFlashDir: function ( ForceSearch )    // detection of Flash Apps directory
    {
        //ForceSearch=0: Try current preference if available (user may have set directory manually) otherwise get predifined places
        //ForceSearch=1: Ignore current preference, get predefined places (e.g. portable mode)
        //ForceSearch=2: Ignore current preference, get predefined places and if this fails do a scan (e.g. search directory)

        var FlashDir = null;
        var knownDir = null;
        //var ExToFind = new RegExp( '^'+bprivacyutils.getPref( "extensions.bprivacy.FlashDirRegEx" ) +"[\\\\\\/]+?$", 'i' );
        var ExToFind = new RegExp ( '^'+bprivacyutils.getPref ( "extensions.bprivacy.FlashDirRegEx" ) +"$", 'i' );
        var Dir = Components.classes ["@mozilla.org/file/local;1"].createInstance ( Components.interfaces.nsILocalFile );
        if ( ForceSearch < 1 )
        {
            var currentDir;
            try {
                currentDir = bprivacyutils.prefsBP.getComplexValue ( "DataDir", Components.interfaces.nsILocalFile );
            } catch ( e ){}

            if ( currentDir )
            {
                try {
                      if ( currentDir.path && currentDir.exists () && currentDir.isDirectory ())
                        knownDir = currentDir;
                } catch ( e ){}
            }

        }

        //scan
        if ( ForceSearch > 0 && !knownDir )
        {
            try {
                //windows
                if ( bprivacy.GetRootDir ( "windows" ) && bprivacy.GetRootDir ( "windows" ).exists () && bprivacy.GetRootDir ( "windows" ).isDirectory ())
                {
                    FlashDir = bprivacy.GetRootDir ( "windows" );
                    FlashDir.append ( "Roaming" );
                    FlashDir.append ( "Macromedia" );
                    if ( FlashDir.exists () && FlashDir.isDirectory ())
                        knownDir = FlashDir;
                    if ( !knownDir )
                    {
                        FlashDir = bprivacy.GetRootDir ( "windows" );
                        FlashDir.append ( "Macromedia" );
                        if ( FlashDir.exists () && FlashDir.isDirectory ())
                            knownDir = FlashDir;
                    }
                    if ( !knownDir && ( !bprivacyutils.getPref ( "extensions.bprivacy.noAutoScan" ) || ForceSearch == 2 ))
                        bprivacy.FindLSORoot ( bprivacy.GetRootDir ( "windows" ), ExToFind );
                }
            } catch ( e ){}
        }
        if ( ForceSearch > 0 && !knownDir )
        {
            try {
                //mac1
                if ( bprivacy.GetRootDir ( "mac1" ) && bprivacy.GetRootDir ( "mac1" ).exists () && bprivacy.GetRootDir ( "mac1" ).isDirectory ())
                {
                    FlashDir = bprivacy.GetRootDir ( "mac1" );
                    FlashDir.append ( "Preferences" );
                    FlashDir.append ( "Macromedia" );
                    if ( FlashDir.exists () && FlashDir.isDirectory ())
                        knownDir = FlashDir;

                    if ( !knownDir && ( !bprivacyutils.getPref ( "extensions.bprivacy.noAutoScan" ) || ForceSearch == 2 ))
                        bprivacy.FindLSORoot ( bprivacy.GetRootDir ( "mac1" ), ExToFind );
                }
            } catch ( e ){}
        }
        if ( ForceSearch > 0 && !knownDir )
        {
            try {
                //mac2
                if ( bprivacy.GetRootDir ( "mac2" ) && bprivacy.GetRootDir ( "mac2" ).exists () && bprivacy.GetRootDir ( "mac2" ).isDirectory ())
                {
                    FlashDir = bprivacy.GetRootDir ( "mac2" );
                    FlashDir.append ( "Macromedia" );
                    if ( FlashDir.exists () && FlashDir.isDirectory ())
                        knownDir = FlashDir;
                    if ( !knownDir && ( !bprivacyutils.getPref ( "extensions.bprivacy.noAutoScan" ) || ForceSearch == 2 ))
                        bprivacy.FindLSORoot ( bprivacy.GetRootDir ( "mac2" ), ExToFind );
                }
            } catch ( e ){}
        }
        if ( ForceSearch > 0 && !knownDir )
        {
            try {
                //linux
                if ( bprivacy.GetRootDir ( "linux" ) && bprivacy.GetRootDir ( "linux" ).exists () && bprivacy.GetRootDir ( "linux" ).isDirectory ())
                {
                    FlashDir = bprivacy.GetRootDir ( "linux" );
                    FlashDir.append ( ".macromedia" );
                    if ( FlashDir.exists () && FlashDir.isDirectory ())
                        knownDir = FlashDir;
                    if ( !knownDir && ( !bprivacyutils.getPref ( "extensions.bprivacy.noAutoScan" ) || ForceSearch == 2 ))
                        bprivacy.FindLSORoot ( bprivacy.GetRootDir ( "linux" ), ExToFind );
                }
            } catch ( e ){}
        }


        try {
              if ( knownDir.path && knownDir.exists () && knownDir.isDirectory ())
            {
                bprivacyutils.prefsBP.setComplexValue ( "DataDir", Components.interfaces.nsILocalFile, knownDir );
                return knownDir;
            }
        } catch ( e ){}

        return null;
    },



    SortLSOView: function ( col )
    {
        var LSOTree = bprivacy.getDoc ().getElementById ( "LSOViewerTree" );
        if ( !LSOTree )
            return;
        bprivacy.SortTable ( col, bprivacy.lsos, LSOTree );
    },



    SortTable: function ( column, table, tree ) {
        var columnName = column;
        if ( !column )
        {
            if ( tree.getAttribute ( "sortResource" ))
                columnName = tree.getAttribute ( "sortResource" );
            else
                return;
        }
        var order = tree.getAttribute ( "sortDirection" ) == "ascending" ? 1 : -1;
        //if it's already sorted by that column, reverse sort
        if ( tree.getAttribute ( "sortResource" ) == column )
            order *= -1;
        var columnSort = function compare ( a, b )
        {
            if ( bprivacy.prepareForComparison ( a [columnName ]) > bprivacy.prepareForComparison ( b [columnName ])) return 1 * order;
            if ( bprivacy.prepareForComparison ( a [columnName ]) < bprivacy.prepareForComparison ( b [columnName ])) return -1 * order;
            return 0;
        }
        table.sort ( columnSort );

        //setting these will make the sort option persist
        tree.setAttribute ( "sortDirection", order == 1 ? "ascending" : "descending" );
        tree.setAttribute ( "sortResource", columnName );
        tree.view = bprivacy.treeView;

        //set the appropriate attributes to show to indicator
        var cols = tree.getElementsByTagName ( "treecol" );
        for ( var i = 0; i < cols.length; i++ ) {
            cols [i ].removeAttribute ( "sortDirection" );
        }
        bprivacy.getDoc ().getElementById ( columnName ).setAttribute ( "sortDirection", order == 1 ? "ascending" : "descending" );

        //redraw tree
        tree.treeBoxObject.invalidate ();

        //get old selection
        tree.view.selection.select (-1);
        if ( bprivacy.selected != null )
        {
            for ( var i = 0; i < table.length; i++ )
            {
                if ( table [i].path == bprivacy.selected )
                {
                    tree.view.selection.select (i);
                    //scroll into view
                    tree.treeBoxObject.ensureRowIsVisible (i);
                    break;
                }
            }

        }

    },



    //prepares an object for easy comparison against another. for strings, lowercases them
    prepareForComparison: function ( obj ) {
            if ( typeof obj == "string" )
                return obj.toLowerCase ();
            return obj;
    },



    showBetterPrivacy: function (){
        try {
            var enumerator = bprivacy.wm.getEnumerator ( "" );
            var win, awin;
            while ( enumerator && enumerator.hasMoreElements ()) {
                awin = enumerator.getNext ();
                if ( awin && awin.document && awin.document.getElementById ( "bprivacy-prefpane" )){
                    win = awin;
                    break;
                }
            }
            if ( !win )
                win = window.openDialog ( 'chrome://bprivacy/content/bprivacyopt.xul', '_blank', 'chrome=yes, resizable=yes, centerscreen=yes', 1 );
            setTimeout ( function (){ win.focus ();}, 1000, win ); //timeout needed to solve strange isssue with the 'Download Statusbar' addon (empty bprivacy window )
        } catch ( e ){ alert ( "An error occured while initializing BetterPrivacy options window (3 )\r\nPlease send the following information to the author: \r\n"+e ); Components.utils.reportError ( e ); }
    },



    getString: function ( strID ){
        var str = "";
        try {
            str = bprivacy.getDoc ().getElementById ( "bprivacy.strBundle" ).getString ( strID );
        } catch ( e ){}
        return str;
    },


    hashString: function ( str ){
        var converter =
          Components.classes ["@mozilla.org/intl/scriptableunicodeconverter"].
            createInstance ( Components.interfaces.nsIScriptableUnicodeConverter );

        // we use UTF-8 here, you can choose other encodings.
        converter.charset = "UTF-8";
        // result is an out parameter,
        // result.value will contain the array length
        var result = {};
        // data is an array of bytes
        var data = converter.convertToByteArray ( str, result );
        var ch = Components.classes ["@mozilla.org/security/hash;1"]
                           .createInstance ( Components.interfaces.nsICryptoHash );
        ch.init ( ch.MD5 );
        ch.update ( data, data.length );
        var hash = ch.finish (false );

        // return the two-digit hexadecimal code for a byte
        function toHexString ( charCode )
        {
          return ( "0" + charCode.toString (16 )).slice (-2 );
        }

        // convert the binary hash data to a hex string.
        var s = Array.from(hash, (c, i) => toHexString(hash.charCodeAt(i))).join("");
        // s now contains your hash in hex
        return s;
    },



    onKeyCode: function ()
    {
        bprivacy.prepareDelLSO ( 0, null );
    },



    initSanitize: function ()
    {
      var overrides = {};
      overrides.sanitizeOnShutdown = true;
      overrides.clearCookiesOnShutdown = true;
      overrides.exclusions  = true;
      bprivacy.handleSanitizeCookies (false, overrides);
      bprivacy.addSanitizeMenuItem ();
    },



    handleSanitizeCookies: function (onShutdown, overrides) {
      try{
            if ( typeof Sanitizer !== 'function' ) {
                  Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                  .getService(Components.interfaces.mozIJSSubScriptLoader)
                  .loadSubScript("chrome://browser/content/sanitize.js", null);
            }
            var handleCookieClearing = bprivacy.shouldHandleCookieClearing (overrides) ;
            if ( handleCookieClearing ) {
                  bprivacySanitizer.overrideSanitizer();
            }
            if  ( typeof Sanitizer !== 'function' )
                 throw (!!onShutdown ? 1 : 2);
            if (onShutdown)  {
                bprivacyutils.clearPref ( "privacy.sanitize.didShutdownSanitize" ); //if observer detects very late cookies
                Sanitizer.onShutdown ();
            }
       } catch (e) {
            if (!bprivacyutils.getPref ( "extensions.bprivacy.debug" ))
                return;
            var msg =  "BetterPrivacy detected a Firefox issue: Firefox failed to initialize the Sanitizer!\r\nDue to this issue BetterPrivacy is unable to prevent deletion of  protected LSOs (if any). \r\nPlease report this problem to the author.\r\n";
            if (e === 1) {
              var confirmed = bprivacy.prompts.confirm ( null, "BetterPrivacy Warning", msg + "\r\nDo you wish to skip Firefox cookie and LSO deletion for this time in order to keep your protected LSOs?" );
              if ( confirmed )
                  bprivacyutils.setPref ( "privacy.sanitize.didShutdownSanitize", true, 128 );
            }else if (e === 2)
               bprivacy.prompts.alert ( null, "BetterPrivacy Warning", msg );
            else {
              bprivacy.prompts.alert ( null, "BetterPrivacy Warning",  msg + e );
              Components.utils.reportError (e);
            }
       }
    },



  addSanitizeItem: function () {
         window.removeEventListener ( "load", bprivacy.addSanitizeItem, true );
          if ( typeof Sanitizer !== 'function' )
              return;
          if ( !bprivacyutils.getPref ( "extensions.bprivacy.AutoDelLSOnExitMode" ))
              return;
          // Sanitizer will execute this
          Sanitizer.prototype.items ["extensions-betterprivacy"] =
          {
          clear : function (){
              try {
                bprivacy.sanitize ( window.document );
              } catch ( e ){}
            },
            get canClear (){
              return true;
            }
          }
  },



   addSanitizeMenuItem: function () {
      window.removeEventListener ( "load", bprivacy.addSanitizeMenuItem, true );
      if ( !bprivacyutils.getPref ( "extensions.bprivacy.AutoDelLSOnExitMode" ))
        return;
      var prefs = document.getElementsByTagName ( "preferences" )[0];
      if ( !prefs.hasChildNodes ())
        return;

      var id = prefs.lastChild.getAttribute ( "id" );
      if ( prefs && !!id )
      {
          var prefName;
          if ( id.indexOf ( "privacy.cpd." ) === 0 )    //FF < 3: sanitizer dialog on exit
          {
            prefName = "privacy.cpd.extensions-betterprivacy";
            var oldPrefName = "privacy.item.extensions-betterprivacy";
            //if an old pref exists then use it
            if ( typeof bprivacyutils.getPref ( prefName ) != 'boolean' ){
              if ( typeof bprivacyutils.getPref ( oldPrefName ) == 'boolean' )
                bprivacyutils.prefs.setBoolPref ( prefName, bprivacyutils.getPref ( oldPrefName ));
              else
                bprivacyutils.prefs.setBoolPref ( prefName, true );
            }
          }
          else if ( id.indexOf ( "privacy." ) === 0 )    //FF options, privacy pane, shutdown-settings
          {
            prefName = "privacy.clearOnShutdown.extensions-betterprivacy";
            if ( typeof bprivacyutils.getPref ( prefName ) != "boolean" ) {
                bprivacyutils.prefs.setBoolPref ( prefName, true );
                bprivacyutils.prefs.setBoolPref ( "services.sync.prefs.sync.privacy.clearOnShutdown.extensions-betterprivacy", true );
            }
          }
          else {
            return;
          }
          var pref = document.createElement ( "preference" );
          pref.setAttribute ( "id", prefName );
          pref.setAttribute ( "name", prefName );
          pref.setAttribute ( "type", "bool" );
          pref.setAttribute ( "defaultValue", true );
          prefs.appendChild ( pref );
          var item;
          var itemList = document.getElementById ( "itemList" );
          if ( itemList )
            item = itemList.lastChild;
          else
          {
            item = document.getElementsByTagName ( "checkbox" );
            item = item [ item.length - 1 ];
          }
          var check = document.createElement ( itemList ? "listitem" : "checkbox" );
          check.setAttribute ( "label", "Flash Cookies" );
          check.setAttribute ( "preference", prefName );
          if ( itemList )
          {
            check.setAttribute ( "type", "checkbox" );
            itemList.appendChild ( check );
          }
          else
          {
            if ( item.parentNode.childNodes.length == 2 )
            {
              var row = document.createElement ( "row" );
              item.parentNode.parentNode.appendChild ( row );
              row.insertBefore ( check, null );
            } else
              item.parentNode.insertBefore ( check, null );
          }
          if ( typeof gSanitizePromptDialog == "object" )
          {
            check.setAttribute ( "onsyncfrompreference", "return gSanitizePromptDialog.onReadGeneric ();" );
          }
          pref.setElementValue ( check );
          bprivacy.addSanitizeItem ();
      }
   },





  sanitize: function ( doc ) {
        var p = doc.getElementById ( "privacy.cpd.extensions-betterprivacy" );
        bprivacyutils.prefs.setBoolPref ( p.name, p.value );
        var ticks = 0;
        if ( doc.getElementById ( "sanitizeDurationChoice" ))
        {
            var idx = doc.getElementById ( "sanitizeDurationChoice" ).selectedIndex;
            var currentTime = new Date ();
            switch ( idx )
            {
            case 0: //1 hour
              ticks = 3600000;
              break;
            case 1: //2 hours
              ticks = 7200000;
              break;
            case 2: //4 hours
              ticks = 14400000;
              break;
            case 3: //today
              ticks = ( currentTime.getHours () * 60 * 60 * 1000 ) + ( currentTime.getMinutes () * 60 * 1000 ) + ( currentTime.getSeconds () * 1000 );
              break;
            }
        }
        //clear LSO data
        bprivacy.prepareDelLSO ( 0, ticks );
  },





    isOptionsURL: function ( url ) {
            try {
              if ( url != "chrome://bprivacy/content/bprivacyopt.xul" )
                return false;
              var gWindowManager =  Components.classes ['@mozilla.org/appshell/window-mediator;1'].getService ( Components.interfaces.nsIWindowMediator );
              var aBrowser = gWindowManager.getMostRecentWindow ( "navigator:browser" );
              if ( !aBrowser )
              {
                  var rwin = gWindowManager.getMostRecentWindow ( "mozilla:betterprivacy" );
                  if ( rwin )
                     rwin.close ();
                  bprivacy.prompts.alert ( window, "BetterPrivacy", "BetterPrivacy requires at least one open browser window!" );
              }
              else
                bprivacy.showBetterPrivacy ();
            } catch ( e ){ alert ( "An error occured while initializing BetterPrivacy options window (2)\r\nPlease send the following information to the author: \r\n"+e ); Components.utils.reportError ( e ); }
            return true;
    },






};



window.addEventListener ( "load", bprivacy.init,false );



