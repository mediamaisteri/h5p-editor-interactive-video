/*global H5PEditor, H5P, H5PIntegration, ns */
H5PEditor.widgets.interactiveVideo = H5PEditor.InteractiveVideo = (function ($) {

  /**
   * Initialize interactive video editor.
   *
   * @class H5PEditor.InteractiveVideo
   * @param {Object} parent
   * @param {Object} field
   * @param {Object} params
   * @param {function} setValue
   */
  function InteractiveVideoEditor(parent, field, params, setValue) {
    var that = this;

    this.parent = parent;
    this.field = field;

    this.findField(this.field.video, function (field) {
      if (field.field.type !== 'video') {
        throw t('notVideoField', {':path': that.field.video});
      }

      if (field.params !== undefined) {
        that.setVideo(field.params);
      }

      field.changes.push(function () {
        that.setVideo(field.params);
      });
    });

    this.findField(this.field.poster, function (field) {
      if (field.field.type !== 'image') {
        throw t('notImageField', {':path': that.field.poster});
      }

      if (field.params !== undefined) {
        that.setPoster(field.params);
      }

      field.changes.push(function () {
        that.setPoster(field.params);
      });
    });

    // Will be true only on first load of IV or if there's no video file
    this.freshVideo = (params === undefined || !parent.params.video.files);

    this.params = $.extend({
      interactions: [],
      bookmarks: [],
      endscreens: []
    }, params);
    setValue(field, this.params);

    this.children = [];

    this.passReadies = true;
    parent.ready(function () {
      that.passReadies = false;

      // Set active right away to generate common fields for interactions.
      that.setActive();
    });

    H5P.$window.on('resize', function () {
      if (that.IV) {
        that.IV.trigger('resize');
      }
    });

    // Tour de editor
    this.currentTabIndex = 0;

    // When wizard changes step
    parent.on('stepChanged', function (event) {
      that.currentTabIndex = event.data.id;
      that.startGuidedTour(H5PEditor.InteractiveVideo.GuidedTours.isOpen());
    });

    // Update paste button
    H5P.externalDispatcher.on('datainclipboard', function (event) {
      if (!that.libraries) {
        return;
      }
      var canPaste = !event.data.reset;
      if (canPaste) {
        // Check if content type is supported here
        canPaste = that.canPaste(H5P.getClipboard());
      }
      that.dnb.setCanPaste(canPaste);
    });
  }

  /**
   * Check if the clipboard can be pasted into IV.
   *
   * @param {Object} [clipboard] Clipboard data.
   * @return {boolean} True, if clipboard can be pasted.
   */
  InteractiveVideoEditor.prototype.canPaste = function (clipboard) {
    if (!clipboard || !clipboard.generic) {
      return false;
    }
    return this.libraries.some(function (element) {
      return element.uberName === clipboard.generic.library;
    });
  };

  /**
   * Must be changed if the semantics for the elements changes.
   * @private
   * @type {string}
   */
  InteractiveVideoEditor.clipboardKey = 'H5PEditor.InteractiveVideo';
  /**
   * Find a field, then run the callback.
   *
   * @param {function} callback
   */
  InteractiveVideoEditor.prototype.findField = function (path, callback) {
    var that = this;
    // Find field when tree is ready.
    this.parent.ready(function () {
      var field = H5PEditor.findField(path, that.parent);

      if (!field) {
        throw H5PEditor.t('core', 'unknownFieldPath', {':path': path});
      }

      callback(field);
    });
  };

  /**
   * Add "add item" items to chooser menu.
   *
   * @param {jQuery} $chooser - Chooser menu to attach the item to.
   * @param {string} textIndex - Index of text to be translated or text if not found.
   * @param {string} selector - Class name.
   * @param {function} action - Action for click.
   * @return {jQuery} Item for adding items.
   */
  InteractiveVideoEditor.prototype.setChooserItem = function ($chooser, textIndex, selector, action) {
    // Best effort for the item text
    var itemText = t(textIndex);
    if (itemText === '[Missing translation ' + textIndex + ']') {
      itemText = textIndex;
    }

    var self = this;

    var $item = $('<div/>', {
      'class': selector,
      html: itemText,
      role: 'button',
      tabindex: 0,
      on: {
        click: function () {
          action.call(self);
        }
      }
    });
    $item.data('default', itemText);
    $chooser.append($item);

    return $item;
  };

  /**
   * Attach a custom tooltip to a jQuery element.
   *
   * @param {jQuery} $element - Element to attach the tooltip to.
   * @param {string} textIndex - Index of text to be translated or text if not found.
   * @return {jQuery} Tooltip element.
   */
  InteractiveVideoEditor.prototype.setTooltip = function ($element, textIndex) {
    var that = this;
    // Best effort for the tooltip text
    var tooltipText = t(textIndex);
    if (tooltipText === '[Missing translation ' + textIndex + ']') {
      tooltipText = textIndex;
    }

    var $tooltip = $('<span>', {
      class: 'h5p-interactive-video-tooltip',
      html: tooltipText
    });

    $element
      .append($tooltip)
      // Hide hover on click
      .hover(undefined, function () {
        if (that.IV.$controls.find('.h5p-show').length === 0) {
          $(this).removeClass('h5p-no-tooltip');
        }
      })
      .click(function () {
        $(this).addClass('h5p-no-tooltip');
      });

    return $tooltip;
  };

  /**
   * Reposition/resize the tooltips.
   */
  InteractiveVideoEditor.prototype.resizeTooltips = function () {
    var that = this;
    /*
     * The tooltips should look like the dnb tooltips, but they lie within
     * the controls bar which overrides the dynamic size of $container. We
     * therefore get the first dnb tooltip and copy the current properties
     * to be set for each tooltip.
     */
    var $base = this.$bar.find('.h5p-dragnbar-tooltip').first();

    var tooltips = this.IV.$container.find('.h5p-interactive-video-tooltip');
    tooltips.each(function () {
      $(this).css('font-size', $base.css('font-size'));
      $(this).css('line-height', $base.css('line-height'));
      $(this).css('padding', $base.css('padding'));

      // Compute horizontal position (left aligned, centered, or right aligned to element)
      var left = $(this).parent().offset().left - $(this).outerWidth() / 2 < 0;
      var right = $(this).parent().offset().left + $(this).outerWidth() / 2 > that.IV.$container.width();
      var pos;
      if (left === right) {
        pos = -($(this).outerWidth() / 2) + $(this).parent().outerWidth() / 2;
      }
      else if (left) {
        pos = 0;
      }
      else {
        pos = -$(this).outerWidth() + $(this).parent().outerWidth();
      }
      $(this).css('left', pos + 'px');
    });
  };

  /**
   * Our tab has been set active. Create a new player if necessary.
   */
  InteractiveVideoEditor.prototype.setActive = function () {
    if (this.IV !== undefined) {
      // A video has been loaded, no need to recreate.
      // (but we can do some resizing :D)
      this.IV.trigger('resize');
      return;
    }

    // Reset css
    this.$editor.css({
      width: '',
      height: '',
      fontSize: ''
    });

    if (this.video === undefined) {
      this.$editor.html(this.noVideoSourceMessage(this.parent)).removeClass('h5p-interactive-video');
      return;
    }

    var that = this;

    // Create new player.
    this.IV = new H5P.InteractiveVideo({
      interactiveVideo: {
        video: {
          files: this.video,
          startScreenOptions: {
            poster: this.poster
          }
        },
        assets: this.params
      }
    }, H5PEditor.contentId);

    this.IV.editor = this;
    $(window).on('resize', function () {
      if (that.dnb) {
        that.dnb.resize();
        that.resizeTooltips();
      }
    });
    for (var i = 0; i < this.IV.interactions.length; i++) {
      this.processInteraction(this.IV.interactions[i], this.params.interactions[i]);
    }
    this.IV.on('controls', function () {
      if (!that.IV) {
        return; // Video source or poster may have changed – abort!
      }

      // Add DragNBar.
      that.$bar = $('<div class="h5p-interactive-video-dragnbar">' + t('loading') + '</div>').prependTo(that.$editor);
      var interactions = findField('interactions', that.field.fields);
      var action = findField('action', interactions.field.fields);
      H5PEditor.LibraryListCache.getLibraries(
        action.options,
        function (libraries) {
          this.createDragNBar(libraries);
          this.setInteractionTitles();
          this.startGuidedTour();
          this.IV.trigger('dnbEditorReady');
        },
        that
      );

      // Add "add item" items
      that.setChooserItem(that.IV.controls.$bookmarksChooser, 'addBookmark', 'h5p-add-bookmark', that.addBookmark);
      that.setChooserItem(that.IV.controls.$endscreensChooser, 'addEndscreen', 'h5p-add-endscreen', that.addEndscreen);

      // Add tooltips
      that.$bookmarksTooltip = that.setTooltip(that.IV.controls.$bookmarksButton, 'tooltipBookmarks');
      that.$endscreensTooltip = that.setTooltip(that.IV.controls.$endscreensButton.parent(), 'tooltipEndscreens');
    });
    this.IV.on('bookmarkAdded', that.bookmarkAdded, that);
    this.IV.on('endscreenAdded', that.endscreenAdded, that);
    this.IV.on('dnbEditorReady', that.resizeTooltips, that);
    this.IV.attach(this.$editor);

    // Create a focus handler
    this.$focusHandler = $('<div>', {
      'class': 'h5peditor-iv-focus-handler'
    }).click(function () {
      if (!that.dnb.focusedElement || !that.dnb.focusedElement.$element.is(':focus')) {

        // No focused element, remove overlay
        that.$focusHandler.removeClass('show');
        that.IV.$overlay.removeClass('h5p-visible');
      }
    }).appendTo(this.IV.$videoWrapper);

    this.pToEm = (this.IV.width / this.IV.fontSize) / 100;
  };

  /**
   * Set custom interaction titles when libraries are registered.
   */
  InteractiveVideoEditor.prototype.setInteractionTitles = function () {
    var self = this;

    this.IV.interactions.forEach(function (interaction) {
      // Try to figure out a title for the dialog
      var title = self.findLibraryTitle(interaction.getLibraryName());
      if (!title) {
        // Couldn't find anything, use default
        title = self.IV.l10n.interaction;
      }

      interaction.setTitle(title);
    });

    // Create title element
    this.$interactionTitle = $('<div>', {
      'class': 'h5p-interaction-button-title'
    }).appendTo(this.$editor);

  };

  InteractiveVideoEditor.prototype.showInteractionTitle = function (title, $interaction) {
    if (!this.$interactionTitle) {
      return;
    }

    // Set static margin
    var fontSize = parseInt(this.IV.$videoWrapper.css('font-size'), 10);
    var staticMargin = 0.3 * fontSize;

    var videoOffsetX = $interaction.position().left;
    var videoOffsetY = $interaction.position().top;
    var dnbOffsetY = this.$bar.height();

    this.$interactionTitle.html(title);

    // center title
    var totalOffsetX = videoOffsetX - (this.$interactionTitle.outerWidth(true) / 2) + ($interaction.width() / 2);
    if (totalOffsetX < 0) {
      totalOffsetX = 0;
    }
    else if (totalOffsetX + this.$interactionTitle.outerWidth(true) > this.IV.$videoWrapper.width()) {
      totalOffsetX = this.IV.$videoWrapper.width() - this.$interactionTitle.outerWidth(true);
    }
    var totalOffsetY = videoOffsetY + dnbOffsetY - this.$interactionTitle.height() - 1;

    this.$interactionTitle.css({
      'left': totalOffsetX,
      'top': totalOffsetY - staticMargin
    }).addClass('show');
  };

  InteractiveVideoEditor.prototype.hideInteractionTitle = function () {
    if (!this.$interactionTitle) {
      return;
    }

    this.$interactionTitle.removeClass('show');
  };

  /**
   * Add bookmark
   */
  InteractiveVideoEditor.prototype.addBookmark = function () {
    var time = this.IV.video.getCurrentTime();

    // Find out where to place the bookmark
    for (var i = 0; i < this.params.bookmarks.length; i++) {
      if (this.params.bookmarks[i].time > time) {
        // Insert before this.
        break;
      }
    }

    var tenth = Math.floor(time * 10) / 10;
    if (this.checkMarkerSpace(tenth) === false) {
      return; // Not space for another bookmark
    }

    // Hide dialog
    if (this.IV.controls.$bookmarksChooser.hasClass('h5p-show')) {
      this.IV.toggleBookmarksChooser(false, {keepStopped: true});
    }
    else if (this.IV.controls.$bookmarks) {
      this.IV.controls.$bookmarks.click();
    }

    // Move other increament other ids.
    this.IV.trigger('bookmarksChanged', {'index': i, 'number': 1});

    this.params.bookmarks.splice(i, 0, {
      time: time,
      label: t('newBookmark')
    });

    var $bookmark = this.IV.addBookmark(i, tenth);
    $bookmark.addClass('h5p-show');
    $bookmark.find('.h5p-bookmark-text').click();
  };

  /**
   * Add endscreen
   * @param {number} time - Time in s to put endscreen at.
   * @param {boolean} freshOnly - If true, the endscreen label will not pop up and only be included for fresh videos.
   */
  InteractiveVideoEditor.prototype.addEndscreen = function (time, freshOnly) {
    if (!this.freshVideo && freshOnly === true) {
      return;
    }

    time = time || this.IV.video.getCurrentTime();

    // Find out where to place the endscreen
    for (var i = 0; i < this.params.endscreens.length; i++) {
      if (this.params.endscreens[i].time > time) {
        // Insert before this.
        break;
      }
    }

    var tenth = Math.floor(time * 10) / 10;
    if (this.checkMarkerSpace(tenth) === false) {
      return; // Not space for another endscreen
    }

    // Hide dialog
    if (this.IV.controls.$endscreensChooser.hasClass('h5p-show')) {
      this.IV.toggleEndscreensChooser(false, {keepStopped: true});
    }
    else if (this.IV.controls.$bookmarks) {
      this.IV.controls.$bookmarks.click();
    }

    // Move other increament other ids.
    this.IV.trigger('endscreensChanged', {'index': i, 'number': 1});

    this.params.endscreens.splice(i, 0, {
      time: time,
      label: H5P.InteractiveVideo.humanizeTime(time) + ' ' + t('endscreen')
    });

    var $endscreen = this.IV.addEndscreen(i, tenth);
    if (!freshOnly) {
      $endscreen.addClass('h5p-show');
    }
  };

  /**
   * Check for blocked marker position.
   *
   * @param {number} tenth - Position to check in tenth.
   * @return {boolean} True if position was free.
   */
  InteractiveVideoEditor.prototype.checkMarkerSpace = function (tenth) {
    if (this.IV.bookmarksMap[tenth] !== undefined) {
      this.displayMessage(t('bookmarkAlreadyExists'));
      return false;
    }
    if (this.IV.endscreensMap[tenth] !== undefined) {
      this.displayMessage(t('endscreenAlreadyExists'));
      return false;
    }
    return true;
  };

  /**
   * Display a popup containing a message.
   *
   * @param {string} message
   */
  InteractiveVideoEditor.prototype.displayMessage = function (message) {
    var timeout;
    var $warning = $('<div/>', {
      'class': 'h5p-iv-message-popup',
      text: message,
      click: function () {
        clearTimeout(timeout);
        $warning.remove();
      }
    }).appendTo(this.$editor);

    timeout = setTimeout(function () {
      $warning.remove();
    }, 3000);
  };

  /**
   * Gets called whenever a bookmark is added to the UI.
   *
   * @param {H5P.Event} event
   */
  InteractiveVideoEditor.prototype.bookmarkAdded = function (event) {
    var self = this;
    var $bookmark = event.data.bookmark;

    $('<a class="h5p-remove-bookmark" href="#"></a>')
      .appendTo($bookmark.find('.h5p-bookmark-label'))
      .click(function () {
        var id = $bookmark.data('id');
        self.params.bookmarks.splice(id, 1);
        self.IV.trigger('bookmarksChanged', {'index': id, 'number': -1});
        $bookmark.remove();
        self.IV.resumeVideo();
        return false;
      });

    // Click to edit label.
    $bookmark.find('.h5p-bookmark-text').click(function () {
      if ($bookmark.hasClass('h5p-force-show')) {
        return; // Double click
      }
      $bookmark.addClass('h5p-force-show');
      var $text = $(this);

      // This is a IE-fix. Without this, text is not shown when editing
      $text.css({overflow: 'visible'});

      var $input = $text.html('<input type="text" class="h5p-bookmark-input" style="width:' + ($text.width() - 19) + 'px" maxlength="255" value="' + $text.text() + '"/>')
        .children()
        .blur(function () {
          var newText = $input.val();
          if (H5P.trim(newText) === '') {
            newText = t('newBookmark');
          }
          $text.text(newText);
          $bookmark.removeClass('h5p-force-show').mouseover().mouseout();
          $text.css({overflow: 'hidden'});

          var id = $bookmark.data('id');
          self.params.bookmarks[id].label = newText;
          self.IV.controls.$bookmarksChooser.find('li:eq(' + id + ')').text(newText);
          self.IV.resumeVideo();
        })
        .keydown(function (event) {
          if (event.which === 13) {
            $input.blur();
          }
        })
        .focus();

      if ($input.val() === t('newBookmark')) {
        // Delete default value when editing
        $input.val('');
      }
    });
  };


  /**
   * Gets called whenever a endscreen is added to the UI.
   *
   * @param {H5P.Event} event
   */
  InteractiveVideoEditor.prototype.endscreenAdded = function (event) {
    var self = this;
    var $endscreen = event.data.endscreen;

    $('<a class="h5p-remove-endscreen" href="#"></a>')
      .appendTo($endscreen.find('.h5p-endscreen-label'))
      .click(function () {
        var id = $endscreen.data('id');
        self.params.endscreens.splice(id, 1);
        self.IV.trigger('endscreensChanged', {'index': id, 'number': -1});
        $endscreen.remove();
        return false;
      });
    self.IV.resumeVideo();
  };

  /**
   * Initialize the toolbar for creating interactivties.
   *
   * @param {Array} libraries
   */
  InteractiveVideoEditor.prototype.createDragNBar = function (libraries) {
    var that = this;

    this.libraries = libraries;
    this.dnb = new H5P.DragNBar(this.getButtons(libraries), this.IV.$videoWrapper, this.IV.$container, {libraries: libraries});
    this.dnb.overflowThreshold = 15;

    /**
     * @private
     * @param {string} lib uber name
     * @returns {boolean}
     */
    var supported = function (lib) {
      for (var i = 0; i < libraries.length; i++) {
        if (libraries[i].restricted !== true && libraries[i].uberName === lib) {
          return true; // Library is supported and allowed
        }
      }

      return false;
    };

    this.dnb.on('paste', function (event) {
      var pasted = event.data;
      var options = {
        width: pasted.width,
        height: pasted.height,
        pasted: true
      };

      if (pasted.from === InteractiveVideoEditor.clipboardKey) {
        // Pasted content comes from the same version of IV

        if (!pasted.generic) {
          // Non generic part, must be a something not created yet
          that.dnb.focus(that.addInteraction(pasted.specific, options));
        }
        else if (supported(pasted.generic.library)) {
          // Has generic part and the generic libray is supported
          that.dnb.focus(that.addInteraction(pasted.specific, options));
        }
        else {
          alert(H5PEditor.t('H5P.DragNBar', 'unableToPaste'));
        }
      }
      else if (pasted.generic) {
        if (supported(pasted.generic.library)) {
          // Supported library from another content type

          if (pasted.specific.displayAsButton) {
            // Make sure buttons from CP still are buttons.
            options.displayType = 'button';
          }
          options.action = pasted.generic;
          that.dnb.focus(that.addInteraction(pasted.generic.library, options));
        }
        else {
          alert(H5PEditor.t('H5P.DragNBar', 'unableToPaste'));
        }
      }
    });

    that.dnb.dnr.on('stoppedResizing', function (event) {
      // Set size in em
      that.interaction.setSize(event.data.width, event.data.height);

      if (event.data.left !== undefined && event.data.top !== undefined) {
        // Set pos in %
        var containerStyle = window.getComputedStyle(that.dnb.$container[0]);
        that.interaction.setPosition(event.data.left / (parseFloat(containerStyle.width) / 100), event.data.top / (parseFloat(containerStyle.height) / 100));
      }
    });

    // Make sure that dialog can't be closed without validation
    that.dnb.dialog.on('open', function () {
      that.dnb.dialog.disableOverlay = true;
    });

    this.dnb.dnd.startMovingCallback = function () {
      that.dnb.dnd.min = {x: 0, y: 0};
      that.dnb.dnd.max = {
        x: that.dnb.$container.width() - that.dnb.$element.outerWidth(),
        y: that.dnb.$container.height() - that.dnb.$element.outerHeight()
      };

      if (that.dnb.newElement) {
        that.dnb.dnd.adjust.x = 10;
        that.dnb.dnd.adjust.y = 10;
        that.dnb.dnd.min.y -= that.dnb.$list.height();
      }

      return true;
    };

    // Update params when the element is dropped.
    this.dnb.stopMovingCallback = function (x, y) {
      that.interaction.positionLabel(that.IV.$videoWrapper.width());
      that.interaction.setPosition(x, y);
    };

    this.dnb.dnd.releaseCallback = function () {
      // Edit element when it is dropped.
      if (that.dnb.newElement) {
        that.dnb.dnd.$element.dblclick();
        that.dnb.blurAll();
      }
    };
    that.IV.interactions.forEach(function (interaction) {
      // Add drag functionality if interaction has element
      if (interaction.getElement()) {
        var libraryName = interaction.getLibraryName();
        var options = {
          cornerLock: (libraryName === 'H5P.Image'),
          disableResize: (libraryName === 'H5P.Link') || interaction.isButton()
        };
        that.addInteractionToDnb(interaction, interaction.getElement(), options);
      }
    });

    if (that.IV.scaledFontSize) {
      // Set the container em since the resizing is useless without it
      that.dnb.dnr.setContainerEm(that.IV.scaledFontSize);
    }

    this.dnb.attach(this.$bar);

    // Set paste button
    this.dnb.setCanPaste(this.canPaste(H5P.getClipboard()));
  };

  /**
   * Create form for interaction.
   *
   * @param {H5P.InteractiveVideoInteraction} interaction
   * @param {Object} parameters
   */
  InteractiveVideoEditor.prototype.createInteractionForm = function (interaction, parameters) {
    var self = this;

    var $semanticFields = $('<div>', {
      'class': 'h5p-dialog-inner-semantics'
    });

    // Create form
    interaction.$form = $semanticFields;
    var interactions = findField('interactions', this.field.fields);

    // Clone semantics to avoid changing them for all interactions
    var interactionFields = H5PEditor.$.extend(true, [], interactions.field.fields);

    // Hide some fields for some interaction types
    var type = interaction.getLibraryName();

    if (InteractiveVideoEditor.XAPI_QUESTION_TYPES.indexOf(type) === -1) {
      hideFields(interactionFields, ['adaptivity']);
    }
    if (type === 'H5P.Nil') {
      hideFields(interactionFields, ['displayType']);
    }
    if (type !== 'H5P.Text' && type !== 'H5P.Image') {
      hideFields(interactionFields, ['goto']);
    }
    if (['H5P.Text', 'H5P.Image', 'H5P.Link', 'H5P.Table'].indexOf(type) === -1) {
      hideFields(interactionFields, ['visuals']);
    }
    if (type === 'H5P.Summary') {
      var adaptivityFields = findField('adaptivity', interactionFields);
      hideFields(adaptivityFields.fields, ['requireCompletion']);
    }

    if (parameters.visuals === undefined) {

      // Make Image background transparent by default
      if (type === 'H5P.Image') {
        parameters.visuals = {
          backgroundColor: 'rgba(0,0,0,0)',
          boxShadow: true
        };
      }
      // Set default link visuals
      else if (type === 'H5P.Link') {
        parameters.visuals = {
          backgroundColor: 'rgba(0,0,0,0.5)',
          boxShadow: true
        };
      }
    }

    // Always show link as poster
    if (type === 'H5P.Link' || type === 'H5P.GoToQuestion' || type === 'H5P.IVHotspot') {
      var field = findField('displayType', interactionFields);
      // Must set default to false and hide
      field.default = 'poster';
      field.widget = 'none';

      // Hide label field
      var labelField = findField('label', interactionFields);
      labelField.widget = 'none';

      if (type === 'H5P.GoToQuestion' && parameters.pause === undefined) {
        parameters.pause = true;
      }
    }

    // Set default displayType of images to poster
    if (type === 'H5P.Image') {
      const field = findField('displayType', interactionFields);
      field.default = 'poster';
    }

    self.addMetadataForm(type, $semanticFields, interaction.getMetadata());

    H5PEditor.processSemanticsChunk(interactionFields, parameters, $semanticFields, self);

    // Remove library selector and copy button and paste button
    var pos = interactionFields.map(function (field) {
      return field.type;
    }).indexOf('library');
    if (pos > -1) {
      self.children[pos].hide();
    }

    self.setLibraryName(interaction.$form, type);
  };


  /**
   * Add metadata button and form to subcontent
   * See h5p-editor-course-presentation for a similar implementation
   *
   * @param {H5P.InteractiveVideoInteraction} interaction
   * @param {object} parameters
   */
  InteractiveVideoEditor.prototype.addMetadataForm = function (type, $form) {
    // Blocklist of menu items that don't need their own title field
    const blockList = ['H5P.AdvancedText', 'H5P.Image', 'H5P.Table', 'H5P.Text', 'H5P.Link', 'H5P.Nil', 'H5P.GoToQuestion', 'H5P.IVHotspot', 'H5P.TwitterUserFeed'];

    // Inject a custom text field for the metadata title
    var metaDataTitleSemantics = [{
      'name' : 'title',
      'type' : 'text',
      'label' : ns.t('core', 'title'),
      'description': ns.t('core', 'usedForSearchingReportsAndCopyrightInformation'),
      'optional': false
    }];

    // Add the title field for all other libraries
    if (blockList.indexOf(type) === -1) {
      $form.prepend(H5PEditor.$('<div class="h5p-metadata-title-wrapper"></div>'));

      // Ensure it has validation functions
      ns.processSemanticsChunk(metaDataTitleSemantics, {}, $form.children('.h5p-metadata-title-wrapper'), this);

      // Populate the title field
      $form.find('.h5p-metadata-title-wrapper .h5peditor-text')
        .attr('id', 'metadata-title-sub');
    }
  };

  /**
   * Process interaction.
   *
   * @param {H5P.InteractiveVideoInteraction} interaction
   * @param {Object} parameters
   */
  InteractiveVideoEditor.prototype.processInteraction = function (interaction, parameters) {
    var self = this;
    var type = interaction.getLibraryName();
    this.createInteractionForm(interaction, parameters);

    // Keep track of form elements
    interaction.children = this.children;
    this.children = undefined;

    // Interaction fields object generated from interaction children
    var interactionFields = self.getInteractionFields(interaction);

    // Add classes to form elements if they exist
    if (interactionFields.duration.$item) {
      interactionFields.duration.$item.addClass('h5peditor-interaction-duration');
    }

    if (interactionFields.pause.$item) {
      interactionFields.pause.$item.addClass('h5peditor-interaction-pause');
    }

    if (interactionFields.label.$item) {
      interactionFields.label.$item.addClass('h5peditor-interaction-label');

      // Remove label when displayType is poster
      var $displayTypeRadios = $('.h5p-image-radio-button-group input:radio', interaction.$form);
      var $labelWrapper = interactionFields.label.$item;

      $displayTypeRadios.change(function () {
        $labelWrapper.toggleClass('hide', !interaction.isButton());
        if (!interaction.isButton() && interactionFields.pause.$item) {
          interactionFields.pause.$input[0].checked = true;
          interactionFields.pause.$input.trigger('change');
        }
      });

      $labelWrapper.toggleClass('hide', !interaction.isButton());
    }

    if (interactionFields.buttonOnMobile.$item) {
      var $buttonOnMobile = interactionFields.buttonOnMobile.$item;

      if (type == 'H5P.Image') {
        $displayTypeRadios.change(function () {
          $buttonOnMobile.toggleClass('hide', interaction.isButton());
        });

        $buttonOnMobile.addClass((interaction.isButton() ? 'hide' : ''));
      }
      else {
        $buttonOnMobile.remove();
      }
    }

    if (interactionFields.visuals.$group) {
      $('.h5p-image-radio-button-group input:radio', interaction.$form).change(function () {
        interactionFields.visuals.$group.toggleClass('hide', $(this).val() !== 'poster');
      });

      interactionFields.visuals.$group.toggleClass('hide', parameters.displayType !== 'poster');
    }

    // Create require completion instances for content types with scores.
    // Summary is filtered out because it can't be retried.
    var eligibleForRequireCompletion = InteractiveVideoEditor.XAPI_QUESTION_TYPES
      .filter(function (questionType) {
        return questionType !== 'H5P.Summary';
      }).indexOf(interaction.getLibraryName()) >= 0;

    if (eligibleForRequireCompletion) {
      new H5PEditor.InteractiveVideo.RequireCompletion(self, interaction);
    }

    interaction.on('display', function (event) {
      var $interaction = event.data;
      // Customize rendering of interaction
      self.newInteraction(interaction, $interaction);
    });

    // Find library field instance
    var libraryFieldInstance;
    for (var i = 0; i < interaction.children.length; i++) {
      if (interaction.children[i] instanceof H5PEditor.Library) {
        libraryFieldInstance = interaction.children[i];
      }
    }

    if (libraryFieldInstance) {
      /**
       * Callback for when library changes.
       *
       * @private
       */
      var libraryChange = function () {
        var lib = libraryFieldInstance.currentLibrary.split(' ')[0];
        if (lib !== 'H5P.Image') {
          return;
        }

        /**
         * Callback for when image changes.
         *
         * @private
         * @param {Object} newParams
         */
        var imageChange = function (newParams) {
          if (newParams !== undefined && newParams.width !== undefined && newParams.height !== undefined) {
            self.setImageSize(parameters, newParams);
          }
        };

        // Add callback to the correct field
        libraryFieldInstance.forEachChild(function (child) {
          if (child.field.name === 'file') {
            child.changes.push(imageChange);
            return true;
          }
        });
      };

      // Add callback
      libraryFieldInstance.changes.push(libraryChange);
      if (libraryFieldInstance.children !== undefined) {
        // Trigger right away
        libraryChange();
      }
    }

    if (parameters.pasted) {
      if (type === 'H5P.Image' && parameters.action.params.file !== undefined) {
        self.setImageSize(parameters, parameters.action.params.file);
      }
      delete parameters.pasted;
    }
  };

  /**
   * Get interaction fields from interaction children
   * @param {Object} interaction
   * @return {Object} All interaction fields as object properties
   */
  InteractiveVideoEditor.prototype.getInteractionFields = function (interaction) {
    return interaction.children.reduce(function (prev, child) {
      if (child.field && child.field.name) {
        prev[child.field.name] = child;
      }
      return prev;
    }, {});
  };

  /**
   * Help set size for new images and keep aspect ratio.
   *
   * @param {object} parameters
   * @param {object} newParams
   */
  InteractiveVideoEditor.prototype.setImageSize = function (parameters, newParams) {
    if (newParams === undefined || newParams.width === undefined || newParams.height === undefined) {
      return;
    }
    var self = this;

    // Avoid to small images
    var fontSize = Number(self.IV.$videoWrapper.css('fontSize').replace('px', ''));
    if (newParams.width < fontSize) {
      newParams.width = fontSize;
    }
    if (newParams.height < fontSize) {
      newParams.height = fontSize;
    }

    // Reduce height for tiny images, stretched pixels looks horrible
    var suggestedHeight = newParams.height / fontSize;
    if (suggestedHeight < parameters.height) {
      parameters.height = suggestedHeight;
    }

    // Calculate new width
    parameters.width = (parameters.height * (newParams.width / newParams.height));
  };

  /**
   * Add library name to library form.
   *
   * @param {H5P.jQuery} $form
   *   Interaction view form
   * @param {string} libraryType
   *   Library type, e.g. H5P.Blanks
   */
  InteractiveVideoEditor.prototype.setLibraryName = function ($form, libraryType) {
    var libraryName = libraryType.replace('.', '-').toLowerCase() + '-library';
    var $libraryForm = $form.children('.library');
    $libraryForm.addClass(libraryName);
  };

  /**
   *
   * @param interaction
   */
  InteractiveVideoEditor.prototype.openInteractionDialog = function (interaction) {
    var that = this;
    if (that.lastState !== H5P.Video.PAUSED && that.lastState !== H5P.Video.ENDED) {
      // Pause video
      that.IV.video.pause();
    }

    // Try to figure out a title for the dialog
    var title = interaction.getTitle();
    if (title === that.IV.l10n.interaction) {
      // Try to find something better than the default title
      title = that.findLibraryTitle(interaction.getLibraryName());
      if (!title) {
        // Couldn't find anything, use default
        title = that.IV.l10n.interaction;
      }
    }

    // Add dialog buttons
    var $doneButton = $('<a href="#" class="h5p-button h5p-done">' + t('done') + '</a>')
      .click(function () {
        if (H5PEditor.Html) {
          // Need to do this before form is validated
          H5PEditor.Html.removeWysiwyg();
        }
        if (that.validDialog(interaction)) {
          that.dnb.dialog.close();
          interaction.focus();
        }
        that.IV.addSliderInteractions();
        return false;
      });

    var $removeButton = $('<a href="#" class="h5p-button h5p-remove">' + t('remove') + '</a>')
      .click(function () {
        if (H5PEditor.Html) {
          // Need to do this before form is validated
          H5PEditor.Html.removeWysiwyg();
        }
        if (confirm(t('removeInteraction'))) {
          that.removeInteraction(interaction);
          that.dnb.dialog.close();
        }
        that.IV.addSliderInteractions();
        that.dnb.blurAll();
        return false;
      });

    var $buttons = $('<div class="h5p-dialog-buttons"></div>')
      .append($doneButton)
      .append($removeButton);

    interaction.setTitle(title);
    interaction.trigger('openEditDialog');
    that.dnb.dialog.open(interaction.$form, title, interaction.getClass() + '-icon', $buttons);

    // Blur context menu when opening dialog
    setTimeout(function () {
      that.dnb.blurAll();
    }, 0);
  };

  /**
   * Add interaction to drag n bar and initialize listeners.
   * @param {H5P.InteractiveVideoInteraction} interaction Interaction
   * @param {H5P.jQuery} $interaction Interaction element
   * @param {Object} [options] Options for new dnb element
   */
  InteractiveVideoEditor.prototype.addInteractionToDnb = function (interaction, $interaction, options) {
    var that = this;
    var newDnbElement = that.dnb.add($interaction, interaction.getClipboardData(), options);
    var createdNewElement = interaction.setDnbElement(newDnbElement);

    if (!interaction.isButton()) {
      // For posters, we don't want the elements inside the interaction to be tabbable in the editor.
      $interaction.find('.h5p-interaction-inner').find('*').attr('tabindex', '-1');
    }

    // New DragNBarElement was set, register listeners
    if (createdNewElement) {
      newDnbElement.contextMenu.on('contextMenuEdit', function () {
        that.openInteractionDialog(interaction);
        newDnbElement.hideContextMenu();
      });

      newDnbElement.contextMenu.on('contextMenuRemove', function () {
        if (confirm(t('removeInteraction'))) {
          that.removeInteraction(interaction);
          that.dnb.dialog.close();
        }
        that.IV.addSliderInteractions();
        that.dnb.blurAll();
      });

      newDnbElement.contextMenu.on('contextMenuBringToFront', function () {
        // Find interaction index
        var oldZ;
        for (var i = 0; i < that.IV.interactions.length; i++) {
          if (that.IV.interactions[i] === interaction) {
            oldZ = i;
            break;
          }
        }

        // Add to end of params
        that.params.interactions.push(that.params.interactions.splice(oldZ, 1)[0]);

        // Update internally for IV player
        that.IV.interactions.push(that.IV.interactions.splice(oldZ, 1)[0]);

        // Update visuals
        $interaction.appendTo(that.IV.$overlay);
      });

      newDnbElement.contextMenu.on('contextMenuSendToBack', function () {
        // Find interaction index
        var oldZ;
        for (var i = 0; i < that.IV.interactions.length; i++) {
          if (that.IV.interactions[i] === interaction) {
            oldZ = i;
            break;
          }
        }

        // Add to end of params
        that.params.interactions.unshift(that.params.interactions.splice(oldZ, 1)[0]);

        // Update internally for IV player
        that.IV.interactions.unshift(that.IV.interactions.splice(oldZ, 1)[0]);

        // Update visuals
        $interaction.prependTo(that.IV.$overlay);
      });
    }
  };

  /**
   * Called when rendering a new interaction.
   *
   * @param {H5P.InteractiveVideoInteraction} interaction
   * @param {H5P.jQuery} $interaction
   */
  InteractiveVideoEditor.prototype.newInteraction = function (interaction, $interaction) {
    var that = this;
    var libraryName = interaction.getLibraryName();
    var options = {
      cornerLock: (libraryName === 'H5P.Image'),
      disableResize: (libraryName === 'H5P.Link') || interaction.isButton()
    };

    if (!interaction.isButton()) {
      // Add overlay
      $('<div/>', {
        'class': 'h5p-interaction-overlay'
      }).appendTo($interaction);
    }

    if (that.dnb !== undefined) {
      // Add resizing, context menu etc.
      that.addInteractionToDnb(interaction, $interaction, options);
    }

    if (!interaction.isButton()) {
      // Pause video on resizing
      $interaction.children('.h5p-dragnresize-handle').mousedown(function () {
        that.interaction = interaction;
        that.IV.video.pause();
      });
    }

    // Disable the normal dialog
    interaction.dialogDisabled = true;

    $interaction.mousedown(function () {
      // Keep track of last state
      that.IV.lastState = that.IV.currentState;

      that.interaction = interaction;
    }).dblclick(function () {
      if (that.dnb !== undefined) {
        that.openInteractionDialog(interaction);
      }
    }).focus(function () {
      // On focus, show overlay
      that.$focusHandler.addClass('show');
    });
  };

  /**
   * Validate the current dialog to see if it can be closed.
   *
   * @param {H5P.InteractiveVideoInteraction} interaction
   * @returns {boolean}
   */
  InteractiveVideoEditor.prototype.validDialog = function (interaction) {
    var valid = true;
    var elementKids = interaction.children;
    for (var i = 0; i < elementKids.length; i++) {
      if (elementKids[i].validate() === false) {
        valid = false;
      }
    }

    if (valid) {
      // Keep form
      interaction.$form.detach();

      // Remove interaction from display
      interaction.remove(true);

      // Recreate content instance
      interaction.reCreate();

      // Make sure the element is inside the container the next time it's displayed
      interaction.fit = true;

      // Check if we should show again
      interaction.toggle(this.IV.video.getCurrentTime(), true);

      if (this.dnb) {
        this.dnb.blurAll();
      }
    }

    return valid;
  };

  /**
   * Makes sure the given interaction doesn't stick out of the video container.
   *
   * @param {H5P.jQuery} $interaction
   * @param {Object} interactionParams
   */
  InteractiveVideoEditor.prototype.fit = function ($interaction, interactionParams) {
    var self = this;

    var sizeNPosition = self.dnb.getElementSizeNPosition($interaction);
    var updated = H5P.DragNBar.fitElementInside(sizeNPosition);

    // Set the updated properties
    var style = {};

    if (updated.width !== undefined) {
      interactionParams.width = updated.width / self.IV.scaledFontSize;
      style.width = interactionParams.width + 'em';
    }
    if (updated.left !== undefined) {
      interactionParams.x = updated.left / (sizeNPosition.containerWidth / 100);
      style.left = interactionParams.x + '%';
    }
    if (updated.height !== undefined) {
      interactionParams.height = updated.height / self.IV.scaledFontSize;
      style.height = interactionParams.height + 'em';
    }
    if (updated.top !== undefined) {
      interactionParams.y = updated.top / (sizeNPosition.containerHeight / 100);
      style.top = interactionParams.y + '%';
    }

    // Apply style
    $interaction.css(style);
  };

  /**
   * Revert our customization to the dialog.
   */
  InteractiveVideoEditor.prototype.hideDialog = function () {
    this.IV.hideDialog();
    this.IV.$dialog.children('.h5p-dialog-inner').css({
      height: '',
      width: ''
    });
    this.IV.$dialog.children('.h5p-dialog-hide').show();
    this.IV.$dialog.children('.h5p-dialog-buttons').remove();
  };

  /**
   * Remove interaction from video.
   *
   * @param {number} id
   */
  InteractiveVideoEditor.prototype.removeInteraction = function (interaction) {
    for (var i = 0; i < this.IV.interactions.length; i++) {
      if (this.IV.interactions[i] === interaction) {
        this.params.interactions.splice(i, 1);
        this.IV.interactions.splice(i, 1);
        break;
      }
    }
    H5PEditor.removeChildren(interaction.children);
    interaction.remove();
  };

  /**
   * Returns buttons for the DragNBar.
   *
   * @param {Array} libraries
   * @returns {Array}
   */
  InteractiveVideoEditor.prototype.getButtons = function (libraries) {
    var buttons = [];
    for (var i = 0; i < libraries.length; i++) {
      if (libraries[i].restricted === undefined || !libraries[i].restricted) {
        buttons.push(this.getButton(libraries[i]));
      }
    }

    return buttons;
  };

  /**
   * Find the title for the given library.
   *
   * @param {string} libraryName
   * @returns {string}
   */
  InteractiveVideoEditor.prototype.findLibraryTitle = function (libraryName) {
    if (!this.libraries) {
      return;
    }

    for (var i = 0; i < this.libraries.length; i++) {
      if (this.libraries[i].name === libraryName) {
        return this.getLibraryTitle(this.libraries[i]);
      }
    }
  };

  /**
   * Determines a human readable name for the library to use in the editor.
   *
   * @param {string} library
   * @returns {string}
   */
  InteractiveVideoEditor.prototype.getLibraryTitle = function (library) {
    // Determine title
    switch (library.name) {
      case 'H5P.Summary':
        return 'Statements';
      case 'H5P.Nil':
        return 'Label';
      default:
        return library.title;
    }
  };

  /**
   * Returns button data for the given library.
   *
   * @param {string} library
   * @returns {Object}
   */
  InteractiveVideoEditor.prototype.getButton = function (library) {
    var that = this;
    var id = library.name.split('.')[1].toLowerCase();

    return {
      id: id,
      title: that.getLibraryTitle(library),
      createElement: function () {
        return that.addInteraction(library.uberName);
      }
    };
  };

  /**
   * Add a new interaction to the interactive video.
   *
   * @param {string|object} library Content type or parameters
   * @param {object} [options] Override the default options
   * @returns {H5P.jQuery}
   */
  InteractiveVideoEditor.prototype.addInteraction = function (library, options) {
    this.IV.$overlay.addClass('h5p-visible');
    options = options || {};
    var self = this;
    self.IV.video.pause();

    var params;
    if (!(library instanceof String || typeof library === 'string')) {
      params = library;
    }

    var from = Math.floor(self.IV.video.getCurrentTime());
    if (!params) {
      var type = library.split(' ')[0];

      params = {
        x: 47.813153766, // Center button
        y: 46.112273361,
        width: 10,
        height: 10,
        duration: {
          from: from,
          to: from + 10
        },
        libraryTitle: self.findLibraryTitle(type)
      };
      if (options.action) {
        params.action = options.action;
        params.displayType = options.displayType ? options.displayType : 'poster';
      }
      else {
        params.action = {
          library: library,
          params: {}
        };
      }
      if (options.width && options.height && !options.displayType) {
        params.width = options.width * this.pToEm;
        params.height = options.height * this.pToEm;
      }
      params.action.subContentId = H5P.createUUID();

      if (type === 'H5P.Nil') {
        params.label = 'Lorem ipsum dolor sit amet...';
      }
      else if (type === 'H5P.Link') {
        // Links are always posters
        params.displayType = 'poster';
      }
      if (options.pasted) {
        params.pasted = true;
      }
    }
    else {
      // Change starting time, but keep the same length
      params.duration.to = from + (params.duration.to - params.duration.from);
      params.duration.from = from;
    }

    var duration = Math.floor(self.IV.video.getDuration());
    if (params.duration.to > duration) {
      // Keep interaction inside video play time
      params.duration.to = duration;
    }

    // Make sure we don't overlap another visible element
    var size = window.getComputedStyle(this.IV.$videoWrapper[0]);
    var widthToPx = parseFloat(size.width) / 100;
    var heightToPx = parseFloat(size.height) / 100;
    var pos = {
      x: params.x * widthToPx,
      y: params.y * heightToPx
    };
    this.dnb.avoidOverlapping(pos, {
      width: params.width * this.IV.scaledFontSize,
      height: params.height * this.IV.scaledFontSize,
    });
    params.x = pos.x / widthToPx;
    params.y = pos.y / heightToPx;

    self.params.interactions.push(params);
    var i = self.params.interactions.length - 1;
    self.interaction = self.IV.initInteraction(i);
    self.processInteraction(self.interaction, params);

    var $interaction = self.interaction.toggle(from);
    this.IV.addSliderInteractions();
    return $interaction;
  };

  /**
   * Set new video params and remove old player.
   *
   * @param {Object} files
   */
  InteractiveVideoEditor.prototype.setVideo = function (files) {
    this.video = files;

    if (this.IV !== undefined) {
      delete this.IV;
    }
  };

  /**
   * Set new poster and remove old player.
   *
   * @param {Object} poster
   */
  InteractiveVideoEditor.prototype.setPoster = function (poster) {
    this.poster = poster;

    if (this.IV !== undefined) {
      delete this.IV;
    }
  };

  /**
   * Disable guided tour
   *
   * @method disableGuidedTour
   */
  InteractiveVideoEditor.disableGuidedTour = function () {
    InteractiveVideoEditor.showGuidedTour = false;
  };
  InteractiveVideoEditor.showGuidedTour = true;
  /**
   * Start the guided tour if not disabled
   *
   * @method startGuidedTour
   * @param  {Boolean}        force If true, don't care if user already has seen it
   */
  InteractiveVideoEditor.prototype.startGuidedTour = function (force) {
    if (InteractiveVideoEditor.showGuidedTour) {
      H5PEditor.InteractiveVideo.GuidedTours.start(this.currentTabIndex, force || false, t);
      // Make sure the guided tour stays behind other important popups
    }
  };

  /**
   * Append field to wrapper.
   *
   * @param {H5P.jQuery} $wrapper
   */
  InteractiveVideoEditor.prototype.appendTo = function ($wrapper) {
    var self = this;
    // Added to support older versions of core. Needed when using IV in CP.
    var $libwrap = $wrapper.parent().parent();
    if ($libwrap.hasClass('libwrap')) {
      $libwrap.addClass('h5p-interactivevideo-editor');
    }

    this.$item = $(this.createHtml()).appendTo($wrapper);
    this.$editor = this.$item.children('.h5peditor-interactions');
    this.$errors = this.$item.children('.h5p-errors');
    this.$bar = this.$item.children('.h5peditor-dragnbar');

    if (InteractiveVideoEditor.showGuidedTour) {
      $('<span>', {
        'class': 'h5peditor-guided-tour',
        html: t('tourButtonStart'),
        click: function () {
          self.startGuidedTour(true);
          return false;
        }
      }).appendTo($('.field-name-interactiveVideo > .h5p-editor-flex-wrapper > .h5peditor-label-wrapper > .h5peditor-label', $libwrap));
      self.startGuidedTour();
    }
  };

  /**
   * Create HTML for the field.
   *
   * @returns {string}
   */
  InteractiveVideoEditor.prototype.createHtml = function () {
    return H5PEditor.createItem(this.field.widget, '<div class="h5peditor-interactions"></div>');
  };

  /**
   * Create HTML for the no video source message.
   *
   * @param {Object} parent
   * @returns {jQuery}
   */
  InteractiveVideoEditor.prototype.noVideoSourceMessage = function (parent) {
    var $html = $('<div/>');

    $('<div/>', {
      'class': 'h5p-no-video-icon',
      appendTo: $html
    });

    $('<div/>', {
      'class': 'h5p-no-video-title',
      text: t('noVideoSource'),
      appendTo: $html
    });

    $('<div/>', {
      'class': 'h5p-no-video-text',
      text: t('selectVideo'),
      appendTo: $html
    });

    $('<button/>', {
      'class': 'h5p-no-video-button h5p-joubelui-button',
      type: 'button',
      text: t('tourButtonBack'),
      click: function () {
        parent.$tabs[0].click();
      },
      appendTo: $html
    });

    return $html;
  };

  /**
   * Validate the current field.
   *
   * @returns {boolean}
   */
  InteractiveVideoEditor.prototype.validate = function () {
    // We must stops the playpack of any media!
    if (this.IV && this.IV.video) {
      this.IV.video.pause();
    }

    // Run validate on interactions to trigger the storing of values
    if (this.IV) {
      for (var i = 0; i < this.IV.interactions.length; i++) {
        var interaction = this.IV.interactions[i];
        for (var j = 0; j < interaction.children.length; j++) {
          interaction.children[j].validate();
        }
      }
    }

    return true; // An interactive video is always valid :-)
  };

  /**
   * Remove this item.
   */
  InteractiveVideoEditor.prototype.remove = function () {
    if (this.dnb !== undefined) {
      this.dnb.remove();
    }
    H5PEditor.InteractiveVideo.GuidedTours.remove();
    this.$item.remove();
  };

  /**
   * Collect functions to execute once the tree is complete.
   *
   * @param {function} ready
   */
  InteractiveVideoEditor.prototype.ready = function (ready) {
    if (this.passReadies) {
      this.parent.ready(ready);
    }
    else {
      this.readies.push(ready);
    }
  };

  /**
   * Translate UI texts for this library.
   *
   * @private
   * @param {string} key
   * @param {Object} [vars] Placeholders
   * @returns {string}
   */
  var t = InteractiveVideoEditor.t = function (key, vars) {
    return H5PEditor.t('H5PEditor.InteractiveVideo', key, vars);
  };

  /**
   * Look for field with the given name in the given collection.
   *
   * @private
   * @param {string} name of field
   * @param {Array} fields collection to look in
   * @returns {Object} field object
   */
  var findField = function (name, fields) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].name === name) {
        return fields[i];
      }
    }
  };

  /**
   * Hide the given fields from the given form.
   *
   * @private
   * @param {Array} interactionFields to be form
   * @param {Array} fields to hide
   */
  var hideFields = function (interactionFields, fields) {
    // Find and hide fields in list
    for (var i = 0; i < fields.length; i++) {
      var field = findField(fields[i], interactionFields);
      if (field) {
        field.widget = 'none';
      }
    }
  };

  /**
   * A maintained list of strings with content types that has a score.
   * @type {string[]}
   */
  InteractiveVideoEditor.XAPI_QUESTION_TYPES = [
    'H5P.MultiChoice',
    'H5P.SingleChoiceSet',
    'H5P.Blanks',
    'H5P.DragQuestion',
    'H5P.Summary',
    'H5P.MarkTheWords',
    'H5P.DragText',
    'H5P.TrueFalse'
  ];

  return InteractiveVideoEditor;
})(H5P.jQuery);

// Default english translations
H5PEditor.language['H5PEditor.InteractiveVideo'] = {
  libraryStrings: {
    selectVideo: 'You must select a video before adding interactions.',
    noVideoSource: 'No Video Source',
    notVideoField: '":path" is not a video.',
    notImageField: '":path" is not a image.',
    insertElement: 'Click and drag to place :type',
    popupTitle: 'Edit :type',
    done: 'Done',
    loading: 'Loading...',
    remove: 'Remove',
    removeInteraction: 'Are you sure you wish to remove this interaction?',
    addBookmark: 'Add bookmark at @timecode',
    newBookmark: 'New bookmark',
    bookmarkAlreadyExists: 'Bookmark already exists here. Move playhead and add a bookmark or a submit screen at another time.',
    tourButtonStart: 'Tour',
    tourButtonExit: 'Exit',
    tourButtonDone: 'Done',
    tourButtonBack: 'Back',
    tourButtonNext: 'Next',
    tourStepUploadIntroText: '<p>This tour guides you through the most important features of the Interactive Video editor.</p><p>Start this tour at any time by pressing the Tour button in the top right corner.</p><p>Press EXIT to skip this tour or press NEXT to continue.</p>',
    tourStepUploadFileTitle: 'Adding video',
    tourStepUploadFileText: '<p>Start by adding a video file. You can upload a file from your computer or paste a URL to a YouTube video or a supported video file.</p><p>To ensure compatibility across browsers, you can upload multiple file formats of the same video, such as mp4 and webm.</p>',
    tourStepUploadAddInteractionsTitle: 'Adding interactions',
    tourStepUploadAddInteractionsText: '<p>Once you have added a video, you can start adding interactions.</p><p>Press the <em>Add interactions</em> tab to get started.</p>',
    tourStepCanvasToolbarTitle: 'Adding interactions',
    tourStepCanvasToolbarText: 'To add an interaction, drag an element from the toolbar and drop it onto the video.',
    tourStepCanvasEditingTitle: 'Editing interactions',
    tourStepCanvasEditingText: '<p>Once an interaction has been added, you can drag to reposition it.</p><p>To resize an interaction, press on the handles and drag.</p><p>When you select an interaction, a context menu will appear. To edit the content of the interaction, press the Edit button in the context menu. You can remove an interaction by pressing the Remove button on the context menu.</p>',
    tourStepCanvasBookmarksTitle: 'Bookmarks',
    tourStepCanvasBookmarksText: 'You can add Bookmarks from the Bookmarks menu. Press the Bookmark button to open the menu.',
    tourStepCanvasEndscreensTitle: 'Submit Screens',
    tourStepCanvasEndscreensText: 'You can add submit screens from the submit screens menu. Press the submit screen button to open the menu.',
    tourStepCanvasPreviewTitle: 'Preview your interactive video',
    tourStepCanvasPreviewText: 'Press the Play button to preview your interactive video while editing.',
    tourStepCanvasSaveTitle: 'Save and view',
    tourStepCanvasSaveText: "When you're done adding interactions to your video, press Save/Create to view the result.",
    tourStepSummaryText: 'This optional Summary quiz will appear at the end of the video.',
    fullScoreRequiredPause: '"Full score required" option requires that "Pause" is enabled.',
    fullScoreRequiredRetry: '"Full score required" option requires that "Retry" is enabled',
    fullScoreRequiredTimeFrame: 'There already exists an interaction that requires full score at the same interval as this interaction.<br> Only one of the interactions will be required to answer.',
    addEndscreen: 'Add submit screen at @timecode',
    endscreen: 'Submit screen',
    endscreenAlreadyExists: 'Submit screen already exists here. Move playhead and add a submit screen or a bookmark at another time.',
    tooltipBookmarks: 'Click to add bookmark at the current point in the video',
    tooltipEndscreens: 'Click to add submit screen at the current point in the video'
  }
};
