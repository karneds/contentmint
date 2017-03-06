// You may have situations where you'd like to manipulate a component after it has
// mounted or updated. You may also not want that thing to be the same in the editor
// versus the result. Additionally, you may want a thing to happen across the board for
// all components, or you may want to localize it to specific components when called.
// A component hook can therefore be global (runs on every component) or local (only
// runs if you define it in config). They can also be separate for the 'editing'
// experience and the 'cleanup' phase of the content.
Cmint.createComponentHook('vertical-space', 'Global', {
    editing: function(element) {
        $(element).css({
            'margin-bottom': '24px'
        });
    },
    cleanup: function(element) {
        $(element).css({'margin-bottom': null});
        $(element).insertAfter('<br><br>');
    }
})