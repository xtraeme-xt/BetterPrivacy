

var bprivacyutils = {
        loaded: 0,

      init: function() {
            if ( !bprivacyutils.loaded )  {
                bprivacyutils.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
                bprivacyutils.prefsBP = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.bprivacy.");
                bprivacyutils.loaded = 1;
            }
      },

      getPref: function(prefName, prefType)
      {
          try{
            prefType = prefType ? prefType : bprivacyutils.prefs.getPrefType(prefName);
          }catch(e){}
          if (prefType === 32)
              return bprivacyutils.prefs.getCharPref(prefName);
          else if (prefType === 64)
              return bprivacyutils.prefs.getIntPref(prefName);
          else if (prefType === 128)
              return bprivacyutils.prefs.getBoolPref(prefName);
          else
              return undefined;
      },

      setPref: function(prefName, val, prefType)
      {
          try{
            prefType = prefType ? prefType : bprivacyutils.prefs.getPrefType(prefName);
          }catch(e){}
          if (prefType === 32)
              bprivacyutils.prefs.setCharPref(prefName, val);
          else if (prefType === 64)
              bprivacyutils.prefs.setIntPref(prefName, val);
          else if (prefType === 128)
              bprivacyutils.prefs.setBoolPref(prefName, val);
          else
              alert ("Invalid preference "+prefName+" check that it is listed in defaults/bprivacyprefs.js");
      },

      clearPref: function(prefName)
      {
          if (bprivacyutils.prefs.prefHasUserValue(prefName))
              bprivacyutils.prefs.clearUserPref(prefName);
      },

};