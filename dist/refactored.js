var Cmint = Cmint || (function() {

    'use strict';

    return {

        // The main Vue instance
        App: null,

        // API methods for main vue instance
        AppFn: {},

        // Manages application events
        Bus: new Vue(),

        // Manages drag and drop with dragula.js
        Drag: {},

        // Manages WYSYWIG editing with TinyMCE
        Editor: {
            config: null,
            types: {}
        },

        // API for field system
        Fields: {},

        // Global settings and names
        Settings: {},

        // Stores Data and functionality defined in the 
        // project instance via the Cmint API.
        Instance: {
            Components: {},
            Data: null,
            Editor: {
                Config: null,
                PostProcesses: [],
                Types: {}
            },
            Fields: {
                List: {},
                Processes: {}
            },
            Hooks: {
                Local: {},
                Global: {}
            },
            Menus: {},
            Templates: {},
            Toolbar: []
        },

        // API that manages interaction between DOM and Vue instance data.
        // TinyMCE and dragula both manipulate the DOM directly so we need
        // a system in place that will counteract those actions and give
        // DOM control back over to the Vue data.
        Sync: {},

        // API for managing miscellaneous application features
        Ui: {
            Toolbar: []
        },

        // Helper functions
        Util: {}

    }

})();
Cmint.Settings = {

    config: {
        debug: true,
        tests: true
    },

    name: {
        component: 'Component',
        context: 'Context',
        dataHook: 'data-hook',
        dataContext: 'data-context'
    },

    class: {
        component: '.Component',
        context: '.Context'
    },

    attr: {
        dataContext: '[data-context]',
        dataHook: '[data-hook]'
    }

}
// Assigns Bus to the Vue prototype and makes it available to all subsequent components
// https://devblog.digimondo.io/building-a-simple-eventbus-in-vue-js-64b70fb90834#.2s62ry2rp
Object.defineProperties(Vue.prototype, {
    $bus: {
        get: function() {
            return Cmint.Bus;
        }
    }
})
// Returns boolean if a (element) contains b (element). This is used in our
// dragging feature because dragula does not like it when you drag a component
// into itself.
Cmint.Util.contains = function(a, b) {
    return a.contains ?
        a != b && a.contains(b) :
        !!(a.compareDocumentPosition(b) & 16);
}
// Quick and dirty way to copy object literals
Cmint.Util.copyObject = function(obj) {
    return JSON.parse(JSON.stringify(obj));
}
// Allows us to log lots of stuff to the console for debugging purposes and then
// remove it all
Cmint.Util.debug = function(message) {
    if (Cmint.Settings.config.debug) {
        console.log('DEBUG: ' + message);
    }
}
Cmint.Util.Tests = [];

Cmint.Util.test = function(name, fn) {
    Cmint.Util.Tests.push({
        name: name,
        fn: fn
    })
}

Cmint.Util.formatTestResult = function(result) {
    if (typeof(result) === 'object') {
        return JSON.stringify(result);
    } else {
        return result;
    }
}

Cmint.Util.runTests = function() {
    if (Cmint.Settings.config.tests) {
        Cmint.Util.Tests.forEach(function(test) {
            var result = test.fn();
            if (result[0]) {
                console.log('TEST: ' + test.name + ' -- Passed');
            } else {
                var expected = Cmint.Util.formatTestResult(result[1]);
                var got = Cmint.Util.formatTestResult(result[2]);
                console.error('TEST: ' + test.name + ' -- Failed');
                console.error('=> expected ' + expected);
                console.error('=> returned ' + got);
            }
        })
    }
}
Cmint.Sync.fn = (function() {
    
    // Takes a child and parent DOM element pair and returns
    // the index of the child within the parent.    
    function getContainerPosition(child, parent) {
        var position = null;
        $(parent).children().each(function(i) {
            if (this === child) {
                position = i;
            }
        })
        return position;
    }
    Cmint.Util.test('Cmint.Sync.fn.getContainerPosition', function() {
        var parent = $('<div></div>').append('<span></span>');
        var child = $('<p></p>');
        parent.append(child);

        return getContainerPosition(child[0], parent) === 1 ? 'Passed': 'Failed';
    })
    

    return {
        getContainerPosition: getContainerPosition
    }

})()
// Takes a component element in the stage and returns an array that
// acts as a map to its corresponding data in the main Vue instance.
//
// element = component element in stage
// position = position map as an array (for recursion)
// -> position array
Cmint.Sync.getStagePosition = function(element, position) {

    // parentContext = the nearest parent context element in stage
    // parentComponent = the nearest parent component element in stage
    // name = the name of the context container
    // index = the index in DOM which equals the index in data
    var parentContext, parentComponent, index, context, parent;

    // Setup
    position = position || [];
    parentContext = $(element).closest(Cmint.Settings.class.context);
    parentComponent = $(element).parent().closest(Cmint.Settings.class.component);
    name = parentContext.attr(Cmint.Settings.name.dataContext);
    index = Cmint.Sync.fn.getContainerPosition(element, parentContext);

    position.unshift(index);
    position.unshift(name);

    if (parentComponent.length) {
        return position = Cmint.Sync.getStagePosition(parentComponent[0], position);
    } else {
        return position;
    }

}

Cmint.Util.test('Cmint.Sync.getStagePosition', function() {

    var stage = $('<div class="'+Cmint.Settings.name.context+'" '+Cmint.Settings.name.dataContext+'="stage"></div>');
    var compParent = $('<div class="'+Cmint.Settings.name.component+'"></div>');
    var context = $('<div class="'+Cmint.Settings.name.context+'" '+Cmint.Settings.name.dataContext+'="foo"></div>');
    var compChild = $('<div class="'+Cmint.Settings.name.component+'"></div>');

    compParent.append(context);
    context.append(compChild);
    stage.append(compParent);

    var expected = ['stage', 0, 'foo', 0];
    var got = Cmint.Sync.getStagePosition(compChild[0]);
    var result = _.isEqual(expected, got);

    return [result, expected, got];

})
// Returns a copy of component data from the main Vue instance when given
// an array path that mirrors the location of the component in a nested data
// tree (from getStagePosition)
// position = array path to data object
// environment = array of component objects (stage or thumbnails)
Cmint.Sync.getComponentData = function(position, environment) {

    var data = Cmint.Util.copyObject(environment);

    // remove the first item since that is provided by the environment
    position.shift();

    position.forEach(function(key, i) {
        if (typeof(key) === 'string') {
            data = data.contexts[key];
        } else {
            data = data[key];
        }
    })

    return data;

}

Cmint.Util.test('Cmint.Sync.getComponentData', function() {

    var environment = {
        foo: [ null, {
            contexts: {
                bar: [ null, { 
                    baz: 'tada'
                }]
            }
        }]
    }
    var position = ['foo', 1, 'bar', 1];
    var expected = { baz: 'tada' };
    var got = Cmint.Sync.getComponentData(position, environment.foo);
    var result = _.isEqual(expected, got);

    return [result, expected, got];

})
// Whereas getComponentData returns a copy of the component object
// data, this function returns the actual Vm context and position for
// a given component. The Vm data is returned by reference so that it
// can be mutated (mostly for drag and drop scenarios)
// position = path array mirroring data location
// context = an array of component data objects
// -->
// {
//   context: the array housing the component data,
//   index: the index of the component data
// }
Cmint.Sync.getVmContextData = function(position, context) {

    var output,
        _context = context;

    position.shift();

    position.forEach(function(key, i) {
        if (i === (position.length - 1)) {
            output = {
                context: _context,
                index: key
            }
        } else {
            if (typeof(key) === 'string') {
                _context = _context.contexts;
            }
            _context = _context[key]; 
        }
    })

    return output;

}

Cmint.Util.test('Cmint.Sync.getVmContextData', function() {

    var context = {
        foo: [null, {
            contexts: {
                bar: [null, {
                    baz: 'tada'
                }]
            }
        }]
    }
    var position = ['foo', 1, 'bar', 1];
    var expected = { 
        context: [null, {baz: 'tada'}],
        index: 1
    }
    var got = Cmint.Sync.getVmContextData(position, context.foo);
    var result = _.isEqual(got, expected);

    return [result, expected, got];

})
// Takes data and inserts it into the spot that the position points to within
// a given environment.
Cmint.Sync.insertVmContextData = function(position, data, environment) {

    var context = environment,
        currentContext = Cmint.Sync.getVmContextData(position, context);
        currentContext.context.splice(currentContext.index, 0, data);
    return environment;

}

Cmint.Util.test('Cmint.Sync.insertVmContextData', function() {

    var context = {
        foo: [
            { contexts: { biz: { bal: 'boo' }}},
            { contexts: { bar: [
                { buz: 'byz' },
                { baz: 'tada' }
            ]}}
        ]}
    var position = ['foo', 1, 'bar', 2];
    var data = { beez: 'bundle' };
    var expected = [
        { contexts: { biz: { bal: 'boo' }}},
        { contexts: { bar: [
            { buz: 'byz' },
            { baz: 'tada' },
            { beez: 'bundle' }
        ]}}
    ]
    var got = Cmint.Sync.insertVmContextData(position, data, context.foo);
    var result = _.isEqual(expected, got);

    return [result, expected, got];

})
// Creates a component and stores confit in Components
// Note: your template root element must always be <comp></comp>
// The <comp> component is the meta wrapper that handles all component logic.
// All component markup will be passed via slot.
//
/*  Available config options
    {
        name: 'machine-name', (required)
        display: 'Display Name', (required)
        category: 'Category Name', (required)
        tags: {
            root: 'h1' (overrides <comp> default div),
            other: 'main' (for context components in template)
        },
        contexts: {
            'left-column': [] (for nested components)
        },
        content: {
            'article': 'Lorem ipsum' (for data-edit that triggers tinymce)
        },
        hooks: ['name'], (runs on mount and receives component root element)
        tokens: [
            { 'token name': 'content or fields.output key name' }
        ],
        fields: {
            output: {
                'resultKey': 'value from post-processed field input'
            },
            list: [{ name: 'fieldname', result: 'output-key'}]
        }
    }
*/
Cmint.createComponent = function(options) {
    if (!options.template) console.error('All components need a template');
    if (!options.config) console.error('All components need config options');
    if (Cmint.Instance.Components[name]) {
        console.error('Component "'+options.config.name+'" already exists')
    } else {
        if (!options.config.index) options.config.index = [];
        Cmint.Instance.Components[name] = options.config;
        Vue.component(options.config.name, {
            props: ['config'],
            template: options.template
        })
    }
}
// Creates a component hook function
// Component hooks fire when a component is mounted or updated by Vue.
// Hook types can be 'Local' or 'Global'. Local hooks need to be referenced
// in the component config and will onyl run on that component. Global
// hooks will run on every single component.
// Component hooks take the components root element.
Cmint.createComponentHook = function(name, type, fn) {
    if (Cmint.Instance.Hooks[type][name]) {
        console.error(type + ' component hook "'+name+'" already exists');
    } else {
        Cmint.Instance.Hooks[type][name] = fn;
    }
}
// Creates a tinymce editor post process.
// These will run on a tinymce editor instance after it has updated.
// Takes 'rootElem' of the inline editor (e.target)
Cmint.createEditorPostProcess = function(fn) {
    Cmint.Instance.Editor.PostProcesses.push(fn);
}
// Creates a new field instance
// Input = {
//     name: 'machine-name',
//     config: {
//          type: 'field-type', (required)
//          display: 'Appears in Dropdowns', (required)
//          label: 'Appears above field', (required)
//          help: 'Help text appears under the field',
//          check: /.*/g, used to check text fields
//          input: 'name of input key stored in component data', (required)
//              * field-text, field-choice, field-dropdown = String
//              * field-group = array [{name, label, type}]
//          choices: [{name, result}]
//              * field-choice - field definitions like in a component
//          hook: 'name' of field hook to run before sending to output,
//          menu: 'name' of a menu
//     }   
// }
Cmint.createField = function(options) {

    if (!options.name) console.error('You must give all created fields a name');
    if (!options.config.type) console.error('You must give all created fields a field type');
    if (!options.config.label) console.error('You must give all created fields a label');
    if (!options.config.input) console.error('You must associate all created fields with an input');
    
    if (Cmint.Instance.Fields.List[options.name]) {
        console.error('Field "'+options.name+'" already exists');
    } else {
        Cmint.Instance.Fields.List[options.name] = options.config;
    } 

}
// Field processes will take field inputs after they have been run
// through the token system, mutate the value in some way, and return
// it to be stored in the field output.
// Keep in mind that some fields may use tokens based on content regions
// so every time tinymce triggers a change these processes will run.
Cmint.createFieldProcess = function(name, fn) {
    if (Cmint.Instance.Fields.Processes[name]) {
        console.error('Field process "'+name+'" already exists')
    } else {
        Cmint.Instance.Fields.Processes[name] = fn;
    }
}
// Defines a menu for dropdown fields.
// Each key is mapped to a value that will be inserted into a field input.
Cmint.createMenu = function(name, map) {
    
    if (Cmint.Instance.Menus[name]) {
        console.error('Menu "' + name + '" already exists');
    } else {
        Cmint.Instance.Menus[name] = map;
    }

}
// Defines a template and assigns path and components
// options = {
//     path: '/path/to/template.html',
//     components: ['names', 'of', 'components']   
// }
Cmint.createTemplate = function(name, options) {

    if (Cmint.Instance.Templates[name]) {
        console.error('Template "' + name + '" already exists');
    } else {
        if (!options.path) {
            console.error('Need path for tempalte "' + name + '"');
        }
        if (!options.components) {
            console.error('No components defined for template "' + name +'"');
        }
        Cmint.Instance.Templates[name] = options;
    }

}
// Once someone is done editing content, your application will probably
// want to do something with all of the data via an ajax request to some route.
// Use this function to add a button to the toolbar that carries out 
// whatever you need it to carry out.
/* Options are:
    {
        text: 'button text',
        btnClasses: { 'toolbar-save': true }
        iconClasses: {'fa': true, 'fa-save': true },
        disable: true,                                  
        callback: function() {
            ** sky's the limit **
        }
    }

    * Note 1: if 'disable' is set to true, the button's disable attribute can be toggled 
      by emitting 'toolbar-disabler' with a value of true or false

    * Note 2: if you'd like the button to look different, just add a class and style it yourself.
      If you want to use the theme's version, assign 'toolbar-btn-fancy' as true in btnClasses.

*/
Cmint.createToolbarButton = function(options) {
    Cmint.Ui.Toolbar.push(options)
}

// Default buttons
Cmint.createToolbarButton({
    text: 'Save',
    btnClasses: { 'toolbar-save': true },
    iconClasses: { 'fa': true, 'fa-save': true },
    callback: function() {
        Cmint.Util.debug('content saved');
    }
})

Cmint.createToolbarButton({
    text: 'Context',
    btnClasses: { 'toolbar-context': true },
    iconClasses: { 'fa': true, 'fa-object-ungroup': true },
    callback: function() {
        Cmint.Util.debug('Contextualizing stage components');
    }
})

Cmint.createToolbarButton({
    text: 'Undo',
    btnClasses: { 'toolbar-undo': true },
    iconClasses: { 'fa': true, 'fa-undo': true },
    disable: true,
    callback: function() {
        Cmint.Util.debug('Reverting most recent change');
    }
})
// The <comp> component is the meta component wrapper for all user defined
// components.
Vue.component('comp', {

    props: ['config'],

    render: function(make) {
        var classes = {};
        var tag = this.config.tags && this.config.tags.root
            ? this.config.tags.root
            : 'div';
        classes[Cmint.Settings.name.component] = true;

        return make(
            tag, { 'class': classes },
            this.$slots.default
        )
    },

    mounted: function() {
        Cmint.Util.debug('mounted <comp> "' + this.config.name + '"');
    }
})
// Meta component for contextual regions that nest <comp> instances
Vue.component('context', {

    props: ['tag', 'containers'],

    render: function(make) {
        var classes = {};
        var tag = this.tag || 'div';
        classes[Cmint.Settings.name.context] = true;
        return make(
            tag, { 'class': classes },
            this.containers.map(function(component) {
                return make(
                    component.name, { props: { 'config': component }}
                )
            })
        )
    }

})
Vue.component('toolbar', {

    props: ['changes', 'user', 'name'],

    template: '\
        <div id="Toolbar">\
            <div v-for="btn in toolbarButtons" class="cmint-btn-toolbar">\
                <button :class="btn.btnClasses" @click="btn.callback()" :data-disable="btn.disable || null">\
                    <i :class="btn.iconClasses"></i><span>{{ btn.text }}</span>\
                </button>\
            </div>\
            <div id="EditorToolbar"></div>\
            <div class="right">\
                <span>{{ name }}</span><a :href="\'/\' + user">{{ user }}</a>\
            </div>\
        </div>',

    data: function(){return{

        contextActive: false,
        toolbarButtons: Cmint.Ui.Toolbar

    }},

    methods: {

        disable: function(value) {
            var disablers = $(this.$el).find('[data-disable]');
            if (value) {
                disablers.attr('disabled', true);
            } else {
                disablers.removeAttr('disabled');
            }
        }

    },

    mounted: function() {

        var _this = this;
        _this.$bus.$on('toolbar-disabler', function(value) {
            _this.disable(value);
        })

    }

})
Cmint.Util.runTests();

Cmint.Init = function() {


    Cmint.App = new Vue({

        el: '#App',

        data: {
            
            stage: [{
                name: 'heading',
                display: 'Heading',
                category: 'Content',
                tags: { root: 'h1' },
                content: { text: 'Lorem Ipsum Headingum' }
            }],

            components: [],

            changes: 0,

            username: 'mcgilljo',

            contentName: 'My Content Name'
        
        },

        methods: {},

        mounted: function() {
            Cmint.Util.debug('mounted application');
        }

    })

}