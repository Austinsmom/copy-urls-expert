/*******************************************
* Author: Kashif Iqbal Khan
* Email: kashiif@gmail.com
* License: MPL 1.1, MIT
* Copyright (c) 2013-2015 Kashif Iqbal Khan
********************************************/

'use strict';
var copyUrlsExpert = {
	_prefService: null,
	SORT_BY_TAB_ORDER: 'default',
	SORT_BY_DOMAIN: 'domain',
	SORT_BY_TITLE: 'title',
	TBB_ACTION_ACTIVE_WIN: 'active-win',
	TBB_ACTION_ACTIVE_TAB: 'active-tab',
	TBB_ACTION_ACTIVE_TABGROUP: 'active-tabgroup',
	TBB_ACTION_ALL_WIN: 'all-win',
	TBB_ACTION_OPEN_TABS: 'open-tabs',
	LINE_FEED:'\r\n',
  defaultPattern: null,

	
	_AsynHandler: function(file, oPrefs) {
		this.file = file;
		this.oPrefs = oPrefs;
	},	
	
	handleLoad: function(evt) {
		window.removeEventListener('load', copyUrlsExpert.handleLoad);
		window.addEventListener('unload', copyUrlsExpert.handleUnload, false);
		window.setTimeout(function() { copyUrlsExpert.init(); }, 50 );
	},

	init: function() {
		this._prefService = this._getPrefService();
		this._handleStartup();

		Components.utils.import('resource://copy-urls-expert/keyboardshortcut.jsm');
		Components.utils.import('resource://copy-urls-expert/modifiers.jsm');

		try {
			this._updateShortcutsForDocument(document, this.getCustomShortcuts());	
		}
		catch(ex) { 
			//ignore any exception in new feature and let the init complete 
			Components.utils.reportError(ex);
		}

		this._setupLineFeedChar();
		Components.utils.import('resource://copy-urls-expert/cue-classes.jsm', copyUrlsExpert);
					
		this._AsynHandler.prototype.handleFetch = function(inputStream, status) {
		};

    this._AsynHandler.prototype.read = function(inputStream, status) {
      var data = '';

      var converterStream = null;
      try {
        //data = NetUtil.readInputStreamToString(inputStream, inputStream.available());

        converterStream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
            .createInstance(Components.interfaces.nsIConverterInputStream);
        converterStream.init(inputStream, 'UTF-8', 1024, Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

        var input = {};
        // read all "bytes" (not characters) into the input
        var numChars = converterStream.readString(inputStream.available(), input);
        if (numChars != 0) /* EOF */
          data = input.value;
      }
      catch(ex) {
        Components.utils.reportError('Copy Urls Expert: ' + ex);
        data = null;
      }
      finally {
        if (converterStream) {
          try { converterStream.close(); }
          catch(ex) { Components.utils.reportError('Copy Urls Expert: Error while closing file - ' + ex); }
        }
      }

      return data;

    };

			
		this._AsynHandler.prototype.handleUpdate =  function(status) {  
			if (!Components.isSuccessCode(status)) {  
				// Handle error!
				alert('Copy Urls Expert: Failed to update file templates list file: ' + status);
				return;  
			}  
			
			// Data has been written to the file.
			// First update the preferences to store the path of file
			var relFile = Components.classes['@mozilla.org/pref-relativefile;1'].createInstance(Components.interfaces.nsIRelativeFilePref);  
			relFile.relativeToKey = 'ProfD'; // or any other string listed above  
			relFile.file = this.file;             // |file| is nsILocalFile  
			this.oPrefs.setComplexValue('urltemplatesfile', Components.interfaces.nsIRelativeFilePref, relFile);			  
		};
		
		var cm = document.getElementById('contentAreaContextMenu');
		if (cm != null)	{
			cm.addEventListener('popupshowing', function (evt) { copyUrlsExpert.onContentContextMenuShowing(evt); }, false);
			this.readTemplatesFile(function(result){

				var target = result.templates;
				var index = result.defaultTemplateId;

				if (result.errorStatus) {

					if (target == null) {

		        alert('Copy Urls Expert: Error reading templates list file.\nRestoring to default values.'); // TODO: localize it
		        target = [];
		        index = copyUrlsExpert._setupDefaultModel(target);

		        // attempt to update file
		        var defaultContent = '0' + copyUrlsExpert.LINE_FEED + target.join(copyUrlsExpert.LINE_FEED);
		        copyUrlsExpert._writeDataToFile(defaultContent, this.file, function(inputStream, status) {
		          if (!Components.isSuccessCode(status)) {
		            // Handle error!
		            alert('Copy Urls Expert: Failed to write to templates list file (default values): ' + status); // TODO: localize it
		            return;
		          } });

					}
					else {
						// Handle error!
						alert('Copy Urls Expert: Error reading templates list file.\n' + result.errorStatus); // TODO: localize it
					}

				}

				copyUrlsExpert._updateFuelAppData(target, index);
				
			});
		}
	},

	_setupLineFeedChar: function() {
		var platformStr =  Components.classes['@mozilla.org/network/protocol;1?name=http'].getService(Components.interfaces.nsIHttpProtocolHandler).oscpu.toLowerCase();

		if (platformStr.indexOf('win') != -1) {
		  this.LINE_FEED = '\r\n';
		}
		else if (platformStr.indexOf('mac') != -1) {
		  this.LINE_FEED = '\r';
		}
		else if (platformStr.indexOf('unix') != -1
					|| platformStr.indexOf('linux') != -1
					|| platformStr.indexOf('sun') != -1) {
		  this.LINE_FEED = '\n';
		}
	},
	
	/**
	* Returns a Map of shortcut keys. Map key is action id, value is a json object
	*/
	getCustomShortcuts: function() {
		let shortcutStr = this._prefService.getCharPref('shortcuts'),
				shortcutMap = {};

		if (shortcutStr) {
			// convert pref string to JSON
			let allShortcuts = JSON.parse(shortcutStr);

			// Populate shortcutMap object
			for (let commandId in allShortcuts) {
					let shortcutJson = allShortcuts[commandId]
					shortcutMap[commandId] = KeyboardShortcut.fromPOJO(shortcutJson);
			}
		}

		return shortcutMap;
	},

	handleUnload: function(evt) {
		var cm = document.getElementById('contentAreaContextMenu');
		if (cm != null)	{
			cm.removeEventListener('popupshowing', copyUrlsExpert.onContentContextMenuShowing);
		}
		window.removeEventListener('unload', copyUrlsExpert.handleUnload);

	},

	_handleStartup: function() {
		var oldVersion = '___version___';
		var currVersion = '___version___';
		
		try {
			oldVersion = this._prefService.getCharPref('version');
		}
		catch(e) {}
		
		if (oldVersion != currVersion) {
			this._prefService.setCharPref('version', currVersion);
		}
	},
	
	
	_getPrefService: function() {
		var prefService = null;
		try 
		{
			prefService = gPrefService;
		}
		catch(err)
		{
			// gPrefService not available in SeaMonkey
			prefService = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService);
		}
		
		prefService = prefService.getBranch('extensions.copyurlsexpert.');
		return prefService;
	},
	
	_compareEntriesByTitle: function(a, b) {
	   if (a.title.toLowerCase() < b.title.toLowerCase())
		  return -1
	   if (a.title.toLowerCase() > b.title.toLowerCase())
		  return 1
	   // a must be equal to b
	   return 0
	},

	_compareEntriesByUrl: function(a, b) {
	   if (a.url.toLowerCase() < b.url.toLowerCase())
		  return -1
	   if (a.url.toLowerCase() > b.url.toLowerCase())
		  return 1
	   // a must be equal to b
	   return 0
	},

	_UrlEntry: function (title,url,tab) {
	   this.title=title;
	   this.url=url;
	   this.tab=tab;
	},
	
  _isDuplicate: function(entries, url) {
    url = url.toLowerCase();
		for(var i = 0; i < entries.length; i++) {
      var entryUrl = entries[i];
      if (entryUrl.toLowerCase() == url) {
        return true;
      }
    }
    return false;
  },
  
	_getEntriesFromTabs: function(aBrowsers, filterHidden) {
		var title = '',
        url = '',
        urls = [],
        entries = [];

    var filterDuplicates = this._prefService.getBoolPref('filterduplicates');
    
		for(var i = 0; i < aBrowsers.length; i++) {
			var tabbrowser = aBrowsers[i].gBrowser;
			var tabHistory = aBrowsers[i].sessionHistory;
			
			// Check each tab of this tabbrowser instance
			var numTabs = tabbrowser.browsers.length,
				tabContainer = tabbrowser.tabContainer;
			
			for (var index = 0; index < numTabs; index++) { 
				var targetBrwsr = tabbrowser.getBrowserAtIndex(index),
					targetTab = tabContainer.getItemAtIndex(index)

				if (filterHidden && targetTab.hidden) continue;
        
        if (filterDuplicates && this._isDuplicate(urls, targetBrwsr.currentURI.spec)) {
          continue;
        }
				
				var auxTemp = this._getEntryForTab(targetBrwsr, targetTab);
				entries.push(auxTemp);
        urls.push(auxTemp.url);
			}
		}
		
		return entries;		
	},

	_getEntryForTab: function(brwsr, tab) {
		var url = brwsr.currentURI.spec;
		
    var useContentTitle = this._prefService.getBoolPref("usecontenttitle");

		var title = useContentTitle && brwsr.contentTitle? brwsr.contentTitle : tab.label;

		var entry = new copyUrlsExpert._UrlEntry(title,url);
		return entry;
	},
	
	/*
	Returs a list of entries objects
	@param: tagName - Name of tag to process e.g. a, img
	@param: entryExtractor - pointer to a function that accepts two arguments item and selection
	*/
	_getEntriesFromSelection: function(tagName, entryExtractor) {

		// get the content document
		var filterDuplicates = this._prefService.getBoolPref('filterduplicates');

		var entries = [],
        urls = [],
        sel = content.getSelection(),
        items = content.document.getElementsByTagName(tagName);
		
		for (var i=0;i < items.length;i++) {
			var item = items[i];
			var entry = entryExtractor(item, sel);
			
				// ignore if the <item> is not in selection
			if (entry) {

				if (filterDuplicates && this._isDuplicate(urls, entry.url)) {
					continue;
				}

				entries.push(entry);
				urls.push(entry.url);
			}
		}	
		return entries;		
	},
	
	getEntryFromLink: function(link, sel) {
		var entry = null;
		// skip named anchors
		if (link.href && sel.containsNode(link, true)) {
			var title = link.title;
			if (title == '')
			{
				title = link.text.trim();
			}		
			entry = new copyUrlsExpert._UrlEntry(title,link.href);
		}
		return entry;
	},
	
	getEntryFromImage: function(image, sel) {
		var entry = null;
		// skip named anchors
		if (sel.containsNode(image, true)) {
			var title = image.title;
			if (title == '')
			{
				title = image.name;
			}
			if (title == '')
			{
				title = image.alt;
			}
			
			entry = new copyUrlsExpert._UrlEntry(title,image.src);
		}
		return entry;
	},	
	
	_copyEntriesToClipBoard: function(entries,oPrefs, patternToUse) {

		switch(oPrefs.getCharPref('sortby')) {
			case copyUrlsExpert.SORT_BY_TITLE:
				entries.sort(copyUrlsExpert._compareEntriesByTitle);
				break;
			case copyUrlsExpert.SORT_BY_DOMAIN:
				entries.sort(copyUrlsExpert._compareEntriesByUrl);
				break;
		}
		
		patternToUse = patternToUse || copyUrlsExpert.defaultPattern;
		var str = copyUrlsExpert._transform(patternToUse, entries);

		//alert(str);
		if(str != null && str.length > 0) {
			var oClipBoard = Components.classes['@mozilla.org/widget/clipboardhelper;1'].getService(Components.interfaces.nsIClipboardHelper);
			oClipBoard.copyString(str);
		}
	},

  // dateUtils.format()
  formatDate: function(d, f) {
    // make a single digit two digit by prefixing 0
    function t(n) n<10? "0"+n:n;
    
    var h = d.getHours(), 
        m = d.getMinutes(),
        s = d.getSeconds(),
        month = d.getMonth() + 1, // Months are 0-based index;
  			dt = d.getDate();

    var strDate = f.replace(/YYYY/g, d.getFullYear())
             .replace(/YY/g, d.getFullYear().toString().substr(2))
             .replace(/mm/g, t(month))
             .replace(/m/g, month)
             .replace(/dd/g, t(dt))
             .replace(/d/g, dt)
             .replace(/HH/g, t(h))  // 24-hour clock
             .replace(/hh/g, t(h>12?h-12:h))
             .replace(/h/gi, h)
             .replace(/MM/g, t(m))
             .replace(/M/g, m)
             .replace(/SS/g, t(s))
             .replace(/S/g, s);
             
    return strDate;
  },

	_transform: function(fmtPattern, entries) {
		var returnValue = '';

		var d = new Date();
		
		var strDate = d.toLocaleString();
		var strTime = d.getTime();
		
		var pattern = fmtPattern.pattern;
		
		for(var i = 0; i < entries.length; i++) {
			var entry = entries[i];			
			var mystring = pattern.replace(/\$title/gi,entry.title);
			mystring = mystring.replace(/\$url/gi,entry.url);
			mystring = mystring.replace(/\$index/gi,i+1);
			returnValue += mystring;
		}
		
		returnValue = fmtPattern.prefix + returnValue + fmtPattern.postfix;

    // http://stackoverflow.com/questions/1234712/javascript-replace-with-reference-to-matched-group
		returnValue = returnValue.replace(/\$date\((.+?)\)/g, function(match, grp1){
                        return copyUrlsExpert.formatDate(d, grp1);
                      });

		returnValue = returnValue.replace(/\$date/gi, strDate);
		returnValue = returnValue.replace(/\$time/gi, strTime);
		returnValue = returnValue.replace(/\$n/gi, copyUrlsExpert.LINE_FEED);
		returnValue = returnValue.replace(/\$t/gi, '\t');

		return returnValue;
	},

	_gBrowser: function() {
		var _g = null;
		if (typeof(gBrowser) == undefined) {
			// gBrowser is not available in Seamonkey
			_g = doc.getElementById('content');			
		} else {
			_g = gBrowser;
		}
		return _g;
	},

	performCopyActiveTabUrl: function(templateToUse) {
		var _g = this._gBrowser();

		var entries = [copyUrlsExpert._getEntryForTab(_g.selectedBrowser, _g.selectedTab)];
	
		copyUrlsExpert._copyEntriesToClipBoard(entries, copyUrlsExpert._prefService, templateToUse);
	},
	
	performCopyTabUnderMouseUrl: function() {
		var _g = this._gBrowser();

		var contextTab = _g.mContextTab || _g.selectedTab;
		var entries = [copyUrlsExpert._getEntryForTab(_g.getBrowserForTab(contextTab), contextTab)];
	
		copyUrlsExpert._copyEntriesToClipBoard(entries, copyUrlsExpert._prefService);
	},


	_getBrowsers: function(onlyActiveWindow) {
		var aBrowsers = new Array();       
		
		var winMediator = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator);
		if (onlyActiveWindow) {
			aBrowsers.push(winMediator.getMostRecentWindow('navigator:browser'));
		}
		else {
			var browserEnumerator = winMediator.getEnumerator('navigator:browser');
			// Iterate all open windows
			while (browserEnumerator.hasMoreElements()) {
				aBrowsers.push(browserEnumerator.getNext());
			}
		}
		
		return aBrowsers;
	},
	
	performCopyTabsUrl: function(onlyActiveWindow, filterHidden) {
		this.performCopyTabsUrlWithTemplate(onlyActiveWindow, filterHidden, null);
	},

	performCopyTabsUrlWithTemplate: function(onlyActiveWindow, filterHidden, templateToUse) {
		// This function must be called awith all three arguments
		var aBrowsers = copyUrlsExpert._getBrowsers(onlyActiveWindow);
		
		dump('aBrowsers.length ' + aBrowsers.length);

		var entries = copyUrlsExpert._getEntriesFromTabs(aBrowsers, filterHidden);
		
		copyUrlsExpert._copyEntriesToClipBoard(entries, copyUrlsExpert._prefService, templateToUse);
					
	},
	
	performOpenUrlsInSelection: function() {
		var entries = copyUrlsExpert._getEntriesFromSelection('a', copyUrlsExpert.getEntryFromLink);

		var urls = new Array(entries.length);

		for (var i=0 ; i<urls.length ; i++) {
			urls[i] = entries[i].url;
		}

		copyUrlsExpert._openAllUrls(urls);
	},

	performCopyUrlsInSelection: function() {
		copyUrlsExpert._performCopyUrlsInSelection('a', copyUrlsExpert.getEntryFromLink);
	},
	
	performCopyUrlsOfImagesInSelection: function() {
		copyUrlsExpert._performCopyUrlsInSelection('img', copyUrlsExpert.getEntryFromImage);
	},

	_performCopyUrlsInSelection: function(tagName, entryExtractor) {
		var entries = this._getEntriesFromSelection(tagName, entryExtractor);
		copyUrlsExpert._copyEntriesToClipBoard(entries, copyUrlsExpert._prefService);
	},

	onContentContextMenuShowing: function(evt) {
		if (evt.target.id == 'contentAreaContextMenu')
		{
			var mnuItm = document.getElementById('copyurlsexpert-contextmenu-mainmenu');
			mnuItm.collapsed = copyUrlsExpert._isEmptySelection();
		}
	},
	
	_isEmptySelection: function () {
		// Check if there is some text selected

		var sel = content.getSelection();

		return sel & sel.length > 0;
	},

	performDefaultAction: function() {
		let action = copyUrlsExpert._prefService.getCharPref('toolbaraction');

		switch(action) {
			case copyUrlsExpert.TBB_ACTION_ACTIVE_WIN:
				copyUrlsExpert.performCopyTabsUrl(true);
				break;
			case copyUrlsExpert.TBB_ACTION_ACTIVE_TABGROUP:
				copyUrlsExpert.performCopyTabsUrl(true, true);
				break;
			case copyUrlsExpert.TBB_ACTION_ACTIVE_TAB:
				copyUrlsExpert.performCopyActiveTabUrl();
				break;
			case copyUrlsExpert.TBB_ACTION_ALL_WIN:
				copyUrlsExpert.performCopyTabsUrl(false);
				break;
			case copyUrlsExpert.TBB_ACTION_OPEN_TABS:
				document.getElementById('cmd_cue_openTabs').doCommand();
				break;
		}
	},
	
  showOptionsWindow: function() {
		//window.open('chrome://copy-urls-expert/content/dialogs/options.xul', 'copyUrlsExpertOptionsWindow', 'addressbar=no, modal');

    var features = "chrome,titlebar,toolbar,centerscreen";
    try {
      var instantApply = Services.prefs.getBoolPref('browser.preferences.instantApply');
      features += instantApply ? ",dialog=no" : ",modal";
    }
    catch (e) {
      features += ",modal";
    }
    openDialog('chrome://copy-urls-expert/content/dialogs/options.xul', '', features);
	},

  showAdvanceCopyWindow: function() {
    var features = "chrome,titlebar,toolbar,centerscreen";
    try {
      var instantApply = Services.prefs.getBoolPref('browser.preferences.instantApply');
      features += instantApply ? ",dialog=no" : ",modal";
    }
    catch (e) {
      features += ",modal";
    }
    openDialog('chrome://copy-urls-expert/content/dialogs/advance.xul', '', features);
  },

	_getClipboardText: function() {
		var clip = Components.classes['@mozilla.org/widget/clipboard;1'].getService(Components.interfaces.nsIClipboard);  
		if (!clip) return null;  
		  
		var trans = Components.classes['@mozilla.org/widget/transferable;1'].createInstance(Components.interfaces.nsITransferable);
		if (!trans) return null;  
		
		var source = window;
		
		// Ref: https://developer.mozilla.org/en-US/docs/Using_the_Clipboard
		if ('init' in trans) {
			// When passed a Window object, find a suitable provacy context for it.
			if (source instanceof Ci.nsIDOMWindow)
				// Note: in Gecko versions >16, you can import the PrivateBrowsingUtils.jsm module
				// and use PrivateBrowsingUtils.privacyContextFromWindow(sourceWindow) instead
				source = source.QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIWebNavigation);
 
			trans.init(source);
		}	
		
		trans.addDataFlavor('text/unicode');

	    clip.getData(trans, clip.kGlobalClipboard);  
	      
	    var str       = new Object();  
	    var strLength = new Object();  
	      
	    trans.getTransferData("text/unicode", str, strLength);  

	    if (str) {  
	      str = str.value.QueryInterface(Components.interfaces.nsISupportsString);  
	      str = str.data.substring(0, strLength.value / 2);  
	    }  

	    return str;
	},

	/**
	This function is called for 'Open Tabs from Clipboard' 
	*/
	openTabs: function () {
		var sUrl = this._getClipboardText(),
      // the following regex is extracting urls from any text
      myRe=/((https?):\/\/((?:(?:(?:(?:(?:[a-zA-Z0-9][-a-zA-Z0-9]*)?[a-zA-Z0-9])[.])*(?:[a-zA-Z][-a-zA-Z0-9]*[a-zA-Z0-9]|[a-zA-Z])[.]?)|(?:[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+)))(?::((?:[0-9]*)))?(\/(((?:(?:(?:(?:[a-zA-Z0-9\-_.!~*'():@&=+$,^#]+|(?:%[a-fA-F0-9][a-fA-F0-9]))*)(?:;(?:(?:[a-zA-Z0-9\-_.!~*'():@&=+$,^#]+|(?:%[a-fA-F0-9][a-fA-F0-9]))*))*)(?:\/(?:(?:(?:[a-zA-Z0-9\-_.!~*'():@&=+$,^#]+|(?:%[a-fA-F0-9][a-fA-F0-9]))*)(?:;(?:(?:[a-zA-Z0-9\-_.!~*'():@&=+$,^#]+|(?:%[a-fA-F0-9][a-fA-F0-9]))*))*))*))(?:[?]((?:(?:[;\/?:@&=+$,^#a-zA-Z0-9\-_.!~*'()]+|(?:%[a-fA-F0-9][a-fA-F0-9]))*)))?))?)/ig,
      myArray = null,
      urls  = [],
      filterDuplicates = this._prefService.getBoolPref('filterduplicates');
      
		while ((myArray = myRe.exec(sUrl))) {
			var newUrl = String(myArray[0]);
      
      if (filterDuplicates && this._isDuplicate(urls, newUrl)) {
        continue;
      }
        
			urls.push(newUrl);
		}

		return copyUrlsExpert._openAllUrls(urls);
	},

	_openAllUrls: function (urls) {
		if (!urls.length) return true;

		var _g = this._gBrowser(),
				prefs = copyUrlsExpert._prefService,
				urlOpener = null, webNav;

		var aBrowsers = _g.browsers;

		var start = 0;
		
		var delayStep = prefs.getIntPref('opentabdelaystepinmillisecs');

		if (prefs.getBoolPref('openlinksinwindows')) {
			urlOpener = function(url) {window.open(url);};
		}
		else {
			webNav = aBrowsers[aBrowsers.length-1].webNavigation;

			if (webNav.currentURI.spec == 'about:blank') {
				// yes it is empty
				_g.loadURI(urls[0]);
				start++;
			}
			urlOpener = function(url) {_g.addTab(url);};
		}

		for (; start<urls.length; start++) {
			window.setTimeout( urlOpener, delayStep*start, urls[start]);
		}

		return true;		
	},	

	readTemplatesFile: function(callback) {
		var templatesPrefName = 'urltemplatesfile';
		var file = null;

		var	result = {
					errorStatus: null,
					templates: null,
					defaultTemplateId: -1,
				};

		if (copyUrlsExpert._prefService.prefHasUserValue(templatesPrefName))	{
			var v = copyUrlsExpert._prefService.getComplexValue(templatesPrefName, Components.interfaces.nsIRelativeFilePref);
			file = v.file;

			if(file.exists()) {
				var fetchHandler = new copyUrlsExpert._AsynHandler(file, copyUrlsExpert._prefService);

				Components.utils.import('resource://gre/modules/NetUtil.jsm');

				NetUtil.asyncFetch(file, function(inputStream, status) {

					if (!Components.isSuccessCode(status)) {
						// Handle error!

						result.errorStatus = status;

						callback(result);

						return;
					}

					var data = fetchHandler.read(inputStream, status),
							index;

					if (data == null) {
						result.errorStatus = 'There was an error reading templates file.'
					}
					else {
						result.templates = [];
						index = copyUrlsExpert.convertStringToModel(data, result.templates);
						result.defaultTemplateId = result.templates[index].id;
					}

					callback(result);

				});
				
				return;
			}
		}

		callback(result);

	},


	_readTemplates: function() {		

	},

	_updateFuelAppData: function(target, defaultIndex) {
    // FUEL DEPRECIATED - update local data of all windows

    const Cc = Components.classes,
          Ci = Components.interfaces;

    let defaultPattern = target[defaultIndex];

    let wm = Cc['@mozilla.org/appshell/window-mediator;1']
                       .getService(Ci.nsIWindowMediator);

    // Get the list of browser windows already open
    let windows = wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
      let xulWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);

      xulWindow.copyUrlsExpert.defaultPattern = defaultPattern;
    }
	},
	
	_getWindowMediator: function() {
	  return Components.classes['@mozilla.org/appshell/window-mediator;1']
	  					.getService(Components.interfaces.nsIWindowMediator);
	},

	updateCustomShortcuts: function(shortcutsMap) {
		this._prefService.setCharPref('shortcuts', JSON.stringify(shortcutsMap));
		this._loadCustomShortcuts(shortcutsMap);

	},

	_loadCustomShortcuts: function(shortcutsMap) {

	  let wm = this._getWindowMediator();

	  // Get the list of browser windows already open
	  let windows = wm.getEnumerator('navigator:browser');
	  while (windows.hasMoreElements()) {
	    let domWindow = windows.getNext().QueryInterface(Components.interfaces.nsIDOMWindow);

	    this._updateShortcutsForDocument(domWindow.document, shortcutsMap);
	  }
	},

	_findShortcutExistingAssignment: function(shortcut) {
		let browserWin = this._getWindowMediator().getMostRecentWindow('navigator:browser')

		let allKeySets = browserWin.document.querySelectorAll('keyset'),
				allDefinedKeys,
				shortcutKeyConfig = shortcut.getKeyConfig(),
				attrForKey = shortcutKeyConfig.hasOwnProperty('keycode') ? 'keytext' : 'key',
				keyText = shortcutKeyConfig.keytext.toLowerCase();

		for (let i=0 ; i<allKeySets.length ; i++) {

			allDefinedKeys = allKeySets.item(i).querySelectorAll('key');

			for (let j=0 ; j<allDefinedKeys.length ; j++) {
				let currentKey = allDefinedKeys.item(j);

				if (currentKey.getAttribute(attrForKey).toLowerCase() == keyText) {

					if (shortcut.modifiers.toXulModifiersString() == currentKey.getAttribute('modifiers')) {
						return currentKey;
					}

				}

			} // for allDefinedKeys
		} // for allKeySets

		// No existing assignment found for this shortcut
		return null;
	},

	_updateShortcutsForDocument: function(document, shortcutsMap){

		// Add keyset to XUL document for all the defined shortcuts

		let CUE_KEYSET_ID = 'copyUrlsExpert-keyset',
				keysetParent = document.getElementById('mainKeyset');

		if (keysetParent == null) {
			// loaded in a non-browser window
			return;
		}
		else {
			keysetParent = keysetParent.parentNode;
		}

		let keyset = keysetParent.querySelector('#' + CUE_KEYSET_ID);

		// Remove the old keyset to remove the old key bindings
		if (keyset != null) {
			keyset.remove();
		}

		// Create a new keyset for new shortcuts defined
		keyset = document.createElement('keyset');
		keyset.setAttribute('id', CUE_KEYSET_ID);

		for (let commandId in shortcutsMap) {
			let keyElemId = 'key-' + commandId,
					targetKey = null,
					shortcut = shortcutsMap[commandId];

			if (!shortcut) {
				// shortcut is not defined
				continue;
			}

			targetKey = document.createElement('key');
			targetKey.setAttribute('id', keyElemId);
			targetKey.setAttribute('command', commandId);

			var shortcutKeyConfig = shortcut.getKeyConfig();

			if (shortcutKeyConfig.hasOwnProperty('keycode')) {
				targetKey.setAttribute('keycode', shortcutKeyConfig.keycode);
				targetKey.setAttribute('keytext', shortcutKeyConfig.keytext);
			}
			else {
				targetKey.setAttribute('key', shortcutKeyConfig.keytext);
			}

			if (shortcut.modifiers) {
				targetKey.setAttribute('modifiers', shortcut.modifiers.toXulModifiersString());					
			}

			keyset.appendChild(targetKey);
		}

		keysetParent.appendChild(keyset);

	},

	updateUrlListFile: function(theContent) {
		// Write to prefs 
		// get profile directory  
		var file = Components.classes['@mozilla.org/file/directory_service;1'].getService(Components.interfaces.nsIProperties).get('ProfD', Components.interfaces.nsIFile);
		file.append('copyurlsexpert');
		if( !file.exists() || !file.isDirectory() ) {
			// if it doesn't exist, create   
			file.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0x1FF);   // 0x1FF = 0777
		}
		
		file.append('urls.templates'); 
		
 		var updateHandler = new copyUrlsExpert._AsynHandler(file, copyUrlsExpert._prefService);
		copyUrlsExpert._writeDataToFile(theContent, file, function(inputStream, status) { updateHandler.handleUpdate(inputStream, status); });
	},
	
	_writeDataToFile: function(content, file, fptr) {
		// file is nsIFile, content is a string  
		
		Components.utils.import('resource://gre/modules/NetUtil.jsm'); 	
		Components.utils.import('resource://gre/modules/FileUtils.jsm'); 
		// You can also optionally pass a flags parameter here. It defaults to  
		// FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE | FileUtils.MODE_TRUNCATE;  
		var ostream = FileUtils.openSafeFileOutputStream(file)  
		  
		var converter = Components.classes['@mozilla.org/intl/scriptableunicodeconverter'].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);  
		converter.charset = 'UTF-8';  
		var istream = converter.convertToInputStream(content);  
		
		// The last argument (the callback) is optional.  
		NetUtil.asyncCopy(istream, ostream, fptr);  
	},
	
	/*
	Fills the 'templates' by parsing the contents of 'data'
	@param: data - Contents of file.
	@param: templates - target array object that would be populated.
	@returns: int representing the index of default pattern.
	*/
	_updateModel: function(data, templates) {
    var index = this.convertStringToModel(data, templates);

    if (index == -1) {
      index = copyUrlsExpert._setupDefaultModel(templates);
    }

    return index;

	},

  /*
   Fills the 'templates' by parsing the contents of 'data'
   @param: data - Contents of file.
   @param: templates - target array object that would be populated.
   @returns: int representing the index of default pattern. -1 in case of parsing fails
  */
  convertStringToModel: function(data, templates){
    var lines = data.split(copyUrlsExpert.LINE_FEED);

    var defPatternIndex = -1, defId = -1;

    if (lines.length <2) {
      return -1;
    }

    try
    {
      defId = parseInt(lines[0]);
    }
    catch(ex) {
      // Simply ignore the bad line
    }

    for (let i=1, j=0 ; i<lines.length; i++) {
      var pattern = null;
      try
      {
        pattern = copyUrlsExpert._FormatPattern.parseString(lines[i]);
      }
      catch(ex) {
        // Simply ignore the bad line
        continue;
      }
      templates.push(pattern);

      if (pattern.id == defId) {
        defPatternIndex = j;
      }
      j++;
    }

    if (templates.length == 0) {
      return -1;
    }

    if (defPatternIndex < 0) {
      defPatternIndex = 0;
    }

    return defPatternIndex;

  },

	_setupDefaultModel: function(templates){
		templates.push(new this._FormatPattern(0, 'Default','$url$n'));
		templates.push(new this._FormatPattern(1, 'html','<a href="$url">$title</a>$n'));
		templates.push(new this._FormatPattern(2, 'forum','[a=$url]$title[/a]$n'));
		return 0;
	},
	
};

window.addEventListener
(
  'load', 
  copyUrlsExpert.handleLoad,
  false
);
