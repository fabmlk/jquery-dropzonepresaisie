/**
 * TODO
 *
 */
(function(root,  factory ) {
    if ( typeof define === "function" && define.amd ) {
        // AMD. Register as an anonymous module.
        define([
            "jquery",
            "dropzone"
        ], factory );
    } else if(typeof module === 'object' && module.exports) {
        // Node/CommonJS
        module.exports = factory(require("jquery"), require("dropzone"));
    } else {
        // Browser globals
        factory( jQuery , Dropzone);
    }
}(this, function($, Dropzone) {
    var dropzoneOriginalPrototype = Dropzone.prototype;

    var defaults = {

    };

    var extensions = {

    };

    /**
     * TODO
     *
     * @param options
     * @returns {$.fn}
     */
    $.fn.dropzonepresaisie = function (options) {
        options = $.extend({}, defaults, options || {});

        $.extend(true, Dropzone.prototype, extensions);
        return $.dropzone(options);
    };
}));