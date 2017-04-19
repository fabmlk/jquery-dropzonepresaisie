/**
 * TODO
 *
 */
(function (root, factory) {
        if (typeof define === "function" && define.amd) {
            // AMD. Register as an anonymous module.
            define([
                "jquery",
                "dropzone"
            ], factory);
        } else if (typeof module === 'object' && module.exports) {
            // Node/CommonJS
            module.exports = factory(require("jquery"), require("dropzone"));
        } else {
            // Browser globals
            factory(jQuery, Dropzone);
        }
    }(this, function ($, Dropzone) {

        Dropzone.autoDiscover = false; // we don't want Dropzone to attach itself on DOMContentLoaded

        // we need to keep track manually of what target a selected file come from
        // see https://github.com/enyo/dropzone/issues/1112
        var lastTargetClickedOrDropped = null;

        var defaults = {
            /**** Custom options ****/

            numFiles: 1, // number of files to handle
            // html content to display inside the .dropzone__upload-invitation nodes of the drop targets.
            // If this option is an array, the n-th element will be used in the n-th drop target.
            // If the array length is < numFiles or the array contains falsy values, this default text
            // is used as a replacement.
            uploadInvitation: "Déposez ou sélectionnez votre fichier",
            // function that prompts the user about page dispatch if pdf's num pages is > numFiles
            // @param {Object} o - object of the form
            //                     {
            //                       item: <jQuery object to the .dropzone__item node that selected the pdf or the node itself>
            //                       numPages: <number of pages in the pdf>
            //                     }
            // @param {Function} (Optional) done - callback to call with an object of the form
            //                     {
            //                       numPage <Integer representing a page number (1-based)>: <jQuery object to the .dropzone__target node that should display this specific page>
            //                       ...
            //                     }
            // done() is optional if a promise is returned instead, resolved with the same parameter as the done() callback.
            // By default, we simply display the first page inside the current target
            promptPages: function (o, done) {
                done({1: o.item});
            },


            /**** Dropzone plugin options ****/

            // do not upload on file selection
            autoProcessQueue: false,
            // mime types allowed
            acceptedFiles: "image/*, application/pdf",
            // trick: used online html-to-string formatter http://pojo.sodhanalibrary.com/string.html
            previewTemplate: '' +
            '<div class="dropzone__item">' +
            '	<div class="dropzone__target">' +
            '		<div class="dropzone__upload-invitation fa fa-upload" aria-hidden="true">' +
            '		</div>' +
            '		<div class="dropzone__preview">' +
            '			<img />' +
            '			<canvas width="0" height="0"></canvas>' +
            '		</div>' +
            '		<div class="dropzone__edit">' +
            '			<span class="dropzone__exchange fa fa-exchange fa-4x">Modifier</span>' +
            '		</div>' +
            '	</div>' +
            '	<div class="ropzone__feedback">' +
            '		<div class="dropzone__size"></div>' +
            '		<div class="dropzone__filename"></div>' +
            '		<span class="dropzone__delete fa fa-trash fa-4x">Annuler</span>' +
            '	</div>' +
            '</div>'
        };






        /******************** utils function *********************/

        /**
         * Retreive the dropzone instance from our container.
         * @param {jQuery} $container
         * @returns {Object} the dropzone instance
         */
        function getDropzone($container) {
            return Dropzone.forElement($container.get(0));
        }


        /**
         * Render a specific PDF page number inside a specific canvas.
         * @param {Object} pdf
         * @param {Integer} numPage
         * @param {jQuery} $canvas
         * @param {jQuery} $container
         */
        function renderPage(pdf, pageIndex, $canvas, $container) {
            var canvas = $canvas.get(0);
            var instance = getDropzone($container);

            pdf.getPage(pageIndex).then(function (page) {
                var unscaledViewport = page.getViewport(1);
                // calculate the target width and height we want for the pdf:
                // resize() needs as argument any object with .width and .height attributes,
                // so we can pass it a viewport object directly
                var resizeInfo = instance.options.resize(unscaledViewport);
                if (resizeInfo.trgWidth == null) {
                    resizeInfo.trgWidth = resizeInfo.optWidth;
                }
                if (resizeInfo.trgHeight == null) {
                    resizeInfo.trgHeight = resizeInfo.optHeight;
                }

                // see http://stackoverflow.com/a/33661056/1876248
                var scale = Math.min((resizeInfo.trgHeight / unscaledViewport.height), (resizeInfo.trgWidth / unscaledViewport.width));
                var viewport = page.getViewport(scale);

                // Prepare canvas using PDF page dimensions
                var context = canvas.getContext('2d');

                canvas.height = resizeInfo.trgHeight;
                canvas.width = resizeInfo.trgWidth;

                // Render PDF page into canvas context
                var renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };

                var renderTask = page.render(renderContext);
                renderTask.then(function () {
                    console.log('Page rendered');
                });
            });
        }

        /**
         * Render pdf thumbnail
         * @param {Object} PDFJS - PDF.js instance
         * @param {File} file
         * @param {jQuery} $item - the wrapped .dropzone__item element where to display the pdf
         * @param {jQuery} $container - our custom closured plugin container
         */
        function renderPdf(PDFJS, file, $item, $container) {
            var instance = getDropzone($container);

            PDFJS.getDocument(URL.createObjectURL(file)).then(function (pdf) {
                if (pdf.numPages > 1) {
                    var promptDfd = $.Deferred();

                    var ret = instance.options.promptPages({
                        item: $item,
                        numPages: pdf.numPages
                    }, function (pageMap) {
                        promptDfd.resolve(pageMap);
                    });
                    if (ret && typeof ret.then === "function") { // we got a promise
                        promptDfd = ret;
                    }
                    promptDfd.then(function (pageMaps) {
                        if (!$.isPlainObject(pageMaps)) {
                            throw new Error("Expected object of the form {<numPage>: <target node>, ...}");
                        }

                        file.pageMaps = $.extend({}, pageMaps); // save copy of pageMaps inside the file. See defaults options.

                        // render each page as specified by pageMaps and keep some state inside the $item container
                        $.each(pageMaps, function (numPage, item) {
                            var numPage = parseInt(numPage, 10);

                            // target can be either a DOM node or jQuery wrapper.
                            // Double wrapping is fine for jQuery anyway
                            $item = $(item);

                            if (!$item.hasClass("dropzone__item")) {
                                throw new Error("Expected item to have a class of 'dropzone__item'");
                            }

                            // each page appears inside its own item. We simulate multiple files to the user when
                            // there is only just one.
                            renderPage(pdf, numPage, $item.find("canvas"), $container);

                            // each $item will keep an instance of the file so we can know from here where pages are being dispatched.
                            // So when a file will be replaced or removed, we can retreive its file instance and run through
                            // all pageMaps to discard the other instances and reset the UI.
                            addFileToItem(file, $item, $container)(file.size, file.name + ' (page n°' + numPage + ')');
                        });
                    });
                } else { // only one page
                    renderPage(pdf, 1, $target.find("canvas"), $container);
                }
            });
        }

        /**
         * Get the set of functions we want to override on the underlying dropzone instance.
         * Contrary to the options functions, those functions cannot be passed directly to the Dropzone constructor.
         * As for mergeOptions, we need closure here because we want them to be specific to particulair instance,
         * @param $container
         * @returns {Object}
         */
        function getOverrides($container) {
            return {
                /**
                 * Dropzone attaches an event listener for the drop event to our container element when we created the plugin.
                 * When the drop event is raised (directly or after bubbling), it calls drop().
                 * To us, the container element is not actually a drop target, only .dropzone__target elements are.
                 * We thus need to override drop() to only allow the drop to occur if the event's target was actually a .dropzone__target.
                 * If so we let Dropzone deal with its stuff by calling the parent function, otherwise we prevent it.
                 * Note: I think this is a shortcoming of Dropzone implementation as it does emit a custom "drop" event but never
                 * checks if it was prevented or not, which would have allowed us to avoid overriding the function altogether.
                 * @param {Object} e - the drop event
                 */
                drop: function (e) {
                    var instance = getDropzone($container);
                    // get the .dropzone__item associated to the drop, taking into account bubbling
                    var $item = $(e.target).closest(".dropzone__item");

                    if ($item.length) {
                        lastTargetClickedOrDropped = $item.get(0);
                        Dropzone.prototype.drop.call(instance, e);
                    } else {
                        lastTargetClickedOrDropped = null;
                    }
                }
            };
        }

        /**
         * Build the drop targets in the DOM inside the $container.
         * @param {Object} options
         * @param {jQuery} $container - our custom plugin container
         */
        function buildDropTargets(options, $container) {
            var $dropzoneTarget;

            for (var i = 0; i < options.numFiles; i++) {
                $dropzoneTarget = $(options.previewTemplate);
                $dropzoneTarget.find(".dropzone__upload-invitation").html(options.uploadInvitation[i]);
                $container.append($dropzoneTarget);
            }
        }

        /**
         * Get the options object to transmit to the underlying Dropzone.
         * This object will be merged with the custom options from user-land.
         * @param {jQuery} $container - the jQuery element the dropzone instance will be attached to
         *                            This argument will be the only reference we have to DOM node asking to be a dropzone.
         *                            As we chose to directly extend Dropzone module, we don't have any extra object constructor
         *                            to save the element to. Closures will help us to keep track of it.
         * @returns {Object}
         */
        function mergeOptions(overrideOptions, $container) {

            var dropzoneOptions = {
                resize: function (file) { // save $container inside closure
                    return optionResize(file, $container);
                },
                init: optionInit.bind(null, $container), // save $container inside closure
                thumbnail: function (file, dataUrl) { // save $container inside closure
                    if (dataUrl) {
                        file.url = dataUrl;
                    } else {
                        file.url = URL.createObjectURL(file);
                    }

                    return optionThumbnail(file, $container);
                },
                addedfile: function (file) { // save $container inside closure
                    return optionAddedfile(file, $container);
                },
                accept: function (file, done) {
                    return optionAccept(file, done);
                },
                error: function (file, message) {
                    console.dir(file);
                    alert(message);
                },
            };

            var finalOptions = $.extend({}, defaults, dropzoneOptions, overrideOptions);

            // normalize uploadInvitation option
            if (!$.isArray(finalOptions.uploadInvitation)) {
                finalOptions.uploadInvitation = [finalOptions.uploadInvitation];
            }
            for (var i = 0; i < finalOptions.maxFiles; i++) {
                finalOptions.uploadInvitation[i] = finalOptions.uploadInvitation[i] || defaults.uploadInvitation;
            }

            buildDropTargets(finalOptions, $container);

            // set targets as being clickable for file selection
            finalOptions.clickable = $(".dropzone__target", $container).toArray();
            finalOptions.maxFiles = finalOptions.numFiles;

            return finalOptions;
        }


        /**
         * Add the file to the item, replaçing the current one if any.
         * The first step is reseting the UI. The second step is to update the UI with file information.
         * This is done by returning an updater to call whenever ready.
         *
         * @param {File} file
         * @param {jQuery} $item
         * @param {jQuery} $container - our custom closured plugin container
         * @returns {Function} File Info UI updater ({String} size: the size of the file, {String} name: the name of the file)
         */
        function addFileToItem(file, $item, $container) {
            var instance = getDropzone($container);
            var currentFile = $item.data("file");

            // replace the currentFile
            if (currentFile) {
                $.each(currentFile.pageMaps || [$item.get(0)], function (_, nextItem) {
                    $item.removeClass("dropzone__item--fileadded");
                    $(".dropzone__preview canvas", $item).attr({width: 0, height: 0});
                    $(".dropzone__preview img", $item).removeAttr("src").removeAttr("alt");
                    $item.find(".dropzone__size, .dropzone__filename").text('');
                    $item.removeData("file");
                });

                // tells Dropzone about its removal.
                // Note that this removal may have actually happened earlier inside optionAddedFile.
                // If we try to remove a file that does not exist anymore, Dropzone does not care, so we're safe here.
                instance.removeFile(currentFile);
            }

            $item.data("file", file);

            return function (size, name) {
                $item.find(".dropzone__size").text(size);
                $item.find(".dropzone__filename").text(name);
                $item.addClass("dropzone__item--fileadded"); // this will hide upload-invitation and add the edit zone overlay
            };
        }


        /**
         * Get a thumbnail renderer based on file's mime type.
         * @param {String} mimeType
         * @returns {Function} ({File} file, {jQuery} $container)
         */
        function getThumbnailRendererFromMimeType(mimeType) {
            if (lastTargetClickedOrDropped == null) {
                return $.noop;
            }

            var $item = $(lastTargetClickedOrDropped);

            if (mimeType.indexOf("image") !== -1) {
                return function (file, $container) { // image renderer
                    var image = $item.find("img").get(0);

                    addFileToItem(file, $item, $container)(file.size, file.name);

                    image.alt = file.name;
                    image.src = file.url;
                };
            } else if (mimeType.indexOf("pdf") !== -1) {
                return function (file, $container) { // pdf renderer
                    var instance = getDropzone($container);

                    renderPdf(instance.options.PDFJS, file, $item, $container);
                };
            }
        }





        /******************* option overrides functions ******************/

        /**
         * Called by Dropzone to tell its intention to display the thumbnail after:
         *    1- addedFile() is called
         *    2- passes first internal check of createImageThumbnails option is true, mimeType is image and size <= maxThumbnailFilesize option
         *    3- resize() is called
         *
         * Why override: the native function only deals with image and Dropzone-specific selectors on the previewTemplate.
         *               We want our previewTemplate to be Dropzone-agnostic and reuse it for Pdf display as well.
         *
         * @param {File} file
         * @param {jQuery} $container - our custom closured plugin container
         */
        function optionThumbnail(file, $container) {
            var renderer = getThumbnailRendererFromMimeType(file.type);

            try {
                renderer(file, $container);
            } catch(e) {
                alert(e);
            }
        }



        /**
         * Called by Dropzone once a file has been selected or dropped (input type file onchange event).
         * Note: Dropzone adds the file to its queue before accepting it. Acceptance will simply determine
         * the file's status to be uploaded or not. When this function is called, file has status "ADDED".
         *
         * Why override: its default performs pure UI logic that we don't want to reproduce.
         *
         * @param {File} file
         * @param {jQuery} $container - our custom closured plugin container
         */
        function optionAddedfile(file, $container) {
            var instance = getDropzone($container);
            var currentFile = $(".dropzone__item", $container).data('file');

            if (currentFile) {
                instance.removeFile(currentFile); // tells Dropzone about its removal
            }

            if (file.type.indexOf("pdf") !== -1 && typeof instance.options.PDFJS === "object") { // We can render PDFs
                // Dropzone displays thumbnails asynchronously. We respect this for PDF rendering too.
                setTimeout(function () {
                    instance.options.thumbnail(file, null);
                }, 0);
            }
            // else if images, Dropzone will trigger a call to thumbnail for us
        }



        /**
         * Called by Dropzone to calculate the thumbnail size after:
         *    1- addedFile() is called
         *    2- passes first internal check of createImageThumbnails option is true, mimeType is image and size <= maxThumbnailFilesize option
         * Dropzone generates a thumbnail from creating an entirely new image from the original.
         * It does this by first drawing the original image inside a detached canvas to the new dimensions, then pull its
         * dataUrl representation.
         * This function returns the dimensions that are to be passed to the CanvasRenderingContext2D.drawImage(), long version:
         *      drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
         * If sx, sy, dx, dy are absent, Dropzone defaults them to 0.
         *
         * Why override: the native dropzone function does not try to make the image fit entirely in the container (as in css "100% auto" value for background-size).
         *               Instead, it simply crops its width to the container dimension (as in css "cover" value for background-size).
         * @param {File} file
         * @returns {
         *      srcWidth,   // sWidth
         *      srcHeight,  // sHeight
         *      trgWidth,   // dWidth
         *      trgHeight   // dHeight
         *     }
         */
        function optionResize(file) {
            var $target = $(lastTargetClickedOrDropped).find(".dropzone__target");
            var maxWidth = $target.width();
            var maxHeight = $target.height();
            var width = file.width;
            var height = file.height;

            if (width / maxWidth > height / maxHeight) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            return {
                srcWidth: file.width,
                srcHeight: file.height,
                trgWidth: width,
                trgHeight: height
            };
        }


        /**
         * Called by Dropzone after its internal init() call from the constructor.
         *
         * Why override: this actually doesn't override much since the default option is noop.
         *
         * @param {jQuery} $container - our custom closured plugin container
         */
        function optionInit($container) {
            var instance = getDropzone($container);

            // init events
            $(".dropzone__target", $container).on("click", function () {
                lastTargetClickedOrDropped = $(this).closest(".dropzone__item");
            }).on("dragover dragenter", function () {
                $(this).addClass("dropzone__target--dragover");
            }).on("dragend dragleave drop", function () {
                $(this).removeClass("dropzone__target--dragover");
            });
        }

        /**
         * Called by Dropzone to finalize the acceptance of the file for upload, after:
         *    1- addedFile() is called
         *    2- thumbnail creation
         *    3- passes internal accept() of maxFilesize < file size, mime type matches acceptedFiles options, num files accepted < maxFiles option
         * Note that the thumbnail is still created even though we might discard it here for final upload.
         * The done() function will reject the file for upload and trigger error display logic if we pass it a string.
         * If no argument is passed, the file is accepted.
         *
         * Why override: this doesn't override much as the default is to simply call done() (without arguments)
         *
         * @param {File} file
         * @param {Function} done
         */
        function optionAccept(file, done) {
            // if (lastTargetClickedOrDropped == null) {
            //     return done(""); // just pass non-null value
            // }
            done();
        }






        /**************** extensions to the native Dropzone's prototype ******************/

        var extensions = {
            /**
             * destroy our plugin
             * @param $container
             */
            destroy: function ($container) {
                $(".dropzone__target", $container).each(function (_, $target) {
                    var inst = getDropzone($target);
                    if (typeof inst.destroy === "function") { // not yet documented but exists in Dropzone's source code
                        inst.destroy();
                    }
                });
                Dropzone.prototype = dropzoneOriginalPrototype; // restore prototype
            },


        };

        var dropzoneOriginalPrototype = Dropzone.prototype; // save original prototype
        $.extend(true, Dropzone.prototype, extensions); // extends Dropzone prototype

        // cancel drag & drop outside our dropzones
        $(document.body).on("drop dragover", function (e) {
            e.preventDefault();
            return false;
        });

        /**
         * TODO
         *
         * @param options
         * @returns {$.fn}
         */
        $.fn.multidropzone = function (options) {
            var otherArgs = Array.prototype.slice.call(arguments, 1); // extract secondary parameters

            return this.each(function (_, container) {
                var $container = $(container);
                if (typeof options === "string" && extensions[options]) { // method call ?
                    extensions[options].apply(null, [$container].concat(otherArgs)); // invoke the method
                    return;
                }

                $container.addClass("multidropzone"); // display flex

                var instance = new Dropzone(container, mergeOptions(options, $container));
                $.extend(instance, getOverrides($container));
            });
        };
    })
);