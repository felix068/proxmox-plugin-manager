(function() {
    'use strict';

    function clone(value) {
        return Ext.clone(value);
    }

    function isNonEmpty(value) {
        return !(value === undefined || value === null || value === '');
    }

    function stringify(value) {
        return JSON.stringify(value, null, 2);
    }

    function copyText(text) {
        if (!text) {
            return Promise.resolve();
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }

        return new Promise(function(resolve, reject) {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            try {
                if (document.execCommand('copy')) {
                    resolve();
                } else {
                    reject(new Error('copy failed'));
                }
            } catch (error) {
                reject(error);
            } finally {
                document.body.removeChild(textarea);
            }
        });
    }

    function wrapSection(section) {
        var cloned = clone(section);
        var title = cloned.title || '';
        delete cloned.title;

        if (!cloned.anchor) {
            cloned.anchor = '100%';
        }

        return {
            xtype: 'fieldset',
            title: title,
            collapsible: false,
            margin: '0 0 12 0',
            layout: 'anchor',
            defaults: {
                anchor: '100%',
            },
            items: [cloned],
        };
    }

    function buildTemplateFieldset() {
        return {
            xtype: 'fieldset',
            title: gettext('Template'),
            collapsible: false,
            margin: '0 0 12 0',
            layout: 'anchor',
            defaults: {
                anchor: '100%',
            },
            items: [
                {
                    xtype: 'textareafield',
                    itemId: 'templateJson',
                    name: 'templateJson',
                    submitValue: false,
                    readOnly: false,
                    grow: false,
                    height: 260,
                    value: '',
                    fieldStyle: 'font-family: monospace; white-space: pre;',
                },
                {
                    xtype: 'container',
                    margin: '6 0 0 0',
                    layout: 'hbox',
                    items: [
                        {
                            xtype: 'button',
                            text: gettext('Copy Template'),
                            iconCls: 'fa fa-copy',
                            handler: function(btn) {
                                var win = btn.up('window');
                                var field = win.down('#templateJson');
                                var text = field ? field.getValue() : '';
                                copyText(text)
                                    .then(function() {
                                        if (Ext.toast) {
                                            Ext.toast(gettext('Template copied'));
                                        }
                                    })
                                    .catch(function(error) {
                                        Ext.Msg.alert(gettext('Error'), error.message || String(error));
                                    });
                            },
                        },
                    ],
                },
            ],
        };
    }

    function normalizeQemu(values) {
        var kv = clone(values);

        delete kv.delete;
        ['name', 'pool', 'onboot', 'agent'].forEach(function(field) {
            if (!kv[field]) {
                delete kv[field];
            }
        });

        var boot = PVE.qemu.CreateWizard.prototype.calculateBootOrder(kv);

        if (boot) {
            kv.boot = boot;
        }

        var startup = PVE.Parser.printStartup({
            order: kv.order,
            up: kv.up,
            down: kv.down,
        });

        if (startup) {
            kv.startup = startup;
        }

        delete kv.order;
        delete kv.up;
        delete kv.down;

        return kv;
    }

    function normalizeLxcTemplate(values) {
        var kv = clone(values);

        delete kv.delete;
        delete kv.confirmpw;

        if (!isNonEmpty(kv.pool)) {
            delete kv.pool;
        }

        if (!isNonEmpty(kv.password) && kv['ssh-public-keys']) {
            delete kv.password;
        }

        return kv;
    }

    function normalizeLxcSubmit(values) {
        var kv = normalizeLxcTemplate(values);
        delete kv.tmplstorage;
        return kv;
    }

    function makeSummaryText(kind, values) {
        var kv = kind === 'qemu' ? normalizeQemu(values) : normalizeLxcTemplate(values);

        delete kv.start;

        if (kind === 'lxc') {
            kv = normalizeLxcSubmit(kv);
            delete kv.password;
        }

        return stringify(kv);
    }

    function makeTemplateText(kind, values) {
        var kv = kind === 'qemu' ? normalizeQemu(values) : normalizeLxcTemplate(values);
        delete kv.start;
        return stringify(kv);
    }

    function getViewportSize() {
        var width = window.innerWidth;
        var height = window.innerHeight;

        if (!width || !height) {
            var body = Ext.getBody && Ext.getBody();
            if (body && body.getViewSize) {
                var size = body.getViewSize();
                width = size.width;
                height = size.height;
            }
        }

        return {
            width: width || 1280,
            height: height || 800,
        };
    }

    function fitWindowToViewport(owner) {
        if (!owner || owner.destroyed) {
            return;
        }

        var size = getViewportSize();
        var width = Math.min(Math.max(720, size.width - 40), size.width - 20);
        var height = Math.min(Math.max(560, size.height - 40), size.height - 20);

        owner.setSize(width, height);
        owner.center();

        if (owner.updateLayout) {
            owner.updateLayout();
        }
    }

    function parseTemplateJson(text) {
        if (!text || !text.trim()) {
            return { empty: true };
        }

        try {
            var parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {
                    error: new Error(gettext('Template JSON must be an object')),
                };
            }

            return { data: parsed };
        } catch (error) {
            return { error: error };
        }
    }

    function bindTemplatePreview(owner, kind) {
        var templateField = owner.down('#templateJson');
        if (!templateField) {
            return;
        }

        var syncingTemplate = false;
        var applyingTemplate = false;

        var updateTemplate = Ext.Function.createBuffered(function() {
            if (syncingTemplate || applyingTemplate || !owner.rendered || owner.destroyed) {
                return;
            }

            if (templateField.hasFocus && templateField.hasFocus()) {
                return;
            }

            var values = owner.getValues();
            var text = makeTemplateText(kind, values);

            syncingTemplate = true;
            try {
                if (templateField.getValue() !== text) {
                    templateField.setValue(text);
                }
            } finally {
                syncingTemplate = false;
            }
        }, 50);

        var applyTemplate = Ext.Function.createBuffered(function() {
            if (syncingTemplate || applyingTemplate || !owner.rendered || owner.destroyed) {
                return;
            }

            var parsed = parseTemplateJson(templateField.getValue());
            if (parsed.error) {
                templateField.markInvalid(parsed.error.message || String(parsed.error));
                return;
            }

            templateField.clearInvalid();
            if (parsed.empty) {
                return;
            }

            var values = clone(parsed.data);
            delete values.delete;
            delete values.start;

            applyingTemplate = true;
            try {
                var form = owner.down('form');
                if (form && form.getForm) {
                    form.getForm().setValues(values);
                }
                if (kind === 'qemu') {
                    owner._oneshotTemplateApplyUntil = Date.now() + 250;
                }
            } finally {
                applyingTemplate = false;
            }

            updateTemplate();
        }, 50);

        templateField.on('keyup', applyTemplate, owner);
        templateField.on('change', applyTemplate, owner);
        templateField.on('blur', applyTemplate, owner);

        owner.query('field').forEach(function(field) {
            if (field === templateField) {
                return;
            }
            owner.mon(field, 'change', updateTemplate, owner);
            owner.mon(field, 'select', updateTemplate, owner);
        });

        if (kind === 'qemu') {
            var syncQemuDefaults = Ext.Function.createBuffered(function() {
                if (
                    !owner.rendered ||
                    owner.destroyed ||
                    applyingTemplate ||
                    (owner._oneshotTemplateApplyUntil && Date.now() < owner._oneshotTemplateApplyUntil)
                ) {
                    return;
                }

                var ostypeField = owner.down('combobox[name=ostype]');
                var ostype = ostypeField ? ostypeField.getValue() : undefined;
                var defaults = PVE.qemu.OSDefaults.getDefaults(ostype);

                var bus = owner.down('pveBusSelector');
                if (bus) {
                    bus.setValue(defaults.busType);
                }

                var network = owner.down('pveNetworkCardSelector');
                if (network) {
                    network.setValue(defaults.networkCard);
                }

                var cpu = owner.down('CPUModelSelector');
                if (cpu) {
                    cpu.setValue(defaults.cputype);
                }

                owner.getViewModel().set('current.scsihw', defaults.scsihw || '__default__');
                if (ostype) {
                    owner.getViewModel().set('current.ostype', ostype);
                }

                var memField = owner.down('pveMemoryField[name=memory]');
                if (memField && !memField.isDirty()) {
                    var desired = PVE.Utils.is_windows(ostype) ? '4096' : '2048';
                    memField.setValue(desired);
                    if (memField.resetOriginalValue) {
                        memField.resetOriginalValue();
                    }
                }

                updateTemplate();
            }, 50);

            var syncFields = owner.query('combobox[name=osbase], combobox[name=ostype], checkbox[reference=enableSecondCD]');
            syncFields.forEach(function(field) {
                owner.mon(field, 'change', syncQemuDefaults, owner);
            });

            Ext.defer(syncQemuDefaults, 200);
        } else {
            updateTemplate();
        }

        Ext.defer(updateTemplate, 150);
    }

    function ensureAdvancedToggle(owner) {
        var footer = owner.down('toolbar[dock=bottom]');
        if (!footer) {
            return;
        }

        var checkboxes = owner.query('proxmoxcheckbox');
        var advanced = null;

        for (var i = 0; i < checkboxes.length; i++) {
            if (checkboxes[i].boxLabel === gettext('Advanced')) {
                advanced = checkboxes[i];
                break;
            }
        }

        var sp = Ext.state.Manager.getProvider();
        var advancedOn = sp ? sp.get('proxmox-advanced-cb') : false;

        if (advanced) {
            advanced.show();
            return;
        }

        footer.insert(2, {
            xtype: 'proxmoxcheckbox',
            boxLabelAlign: 'before',
            boxLabel: gettext('Advanced'),
            value: advancedOn,
            listeners: {
                change: function(_, value) {
                    owner.query('inputpanel').forEach(function(panel) {
                        panel.setAdvancedVisible(value);
                    });

                    if (sp) {
                        sp.set('proxmox-advanced-cb', value);
                    }
                },
            },
        });

        owner.query('inputpanel').forEach(function(panel) {
            panel.setAdvancedVisible(advancedOn);
        });
    }

    function buildOneShotCard(kind, owner, sections) {
        var items = sections.map(wrapSection);
        items.push(buildTemplateFieldset());

        return {
            xtype: 'panel',
            title: gettext('Settings'),
            layout: 'anchor',
            scrollable: 'y',
            defaults: {
                anchor: '100%',
            },
            items: items,
        };
    }

    function buildConfirmCard(kind, owner) {
        return {
            xtype: 'panel',
            title: gettext('Confirm'),
            layout: 'fit',
            items: [
                {
                    xtype: 'grid',
                    store: {
                        model: 'KeyValue',
                        sorters: [
                            {
                                property: 'key',
                                direction: 'ASC',
                            },
                        ],
                    },
                    columns: [
                        { header: 'Key', width: 150, dataIndex: 'key' },
                        { header: 'Value', flex: 1, dataIndex: 'value', renderer: Ext.htmlEncode },
                    ],
                },
            ],
            dockedItems: [
                {
                    xtype: 'proxmoxcheckbox',
                    name: 'start',
                    dock: 'bottom',
                    margin: '5 0 0 0',
                    boxLabel: gettext('Start after created'),
                },
            ],
            listeners: {
                show: function(panel) {
                    var wizard = this.up('window');
                    var kv = wizard.getValues();

                    if (kind === 'qemu') {
                        var boot = wizard.calculateBootOrder(kv);
                        if (boot) {
                            kv.boot = boot;
                        }
                    }

                    if (kind === 'lxc') {
                        kv = normalizeLxcSubmit(kv);
                    }

                    delete kv.delete;
                    delete kv.start;

                    var data = [];
                    Ext.Object.each(kv, function(key, value) {
                        if (key === 'delete' || key === 'tmplstorage') {
                            return;
                        }
                        if (kind === 'lxc' && key === 'password') {
                            return;
                        }
                        data.push({ key: key, value: value });
                    });

                    var summaryStore = panel.down('grid').getStore();
                    summaryStore.suspendEvents();
                    summaryStore.removeAll();
                    summaryStore.add(data);
                    summaryStore.sort();
                    summaryStore.resumeEvents();
                    summaryStore.fireEvent('refresh');
                },
            },
            onSubmit: function() {
                submitOneShot(owner, kind, owner.getValues());
            },
        };
    }

    function submitOneShot(owner, kind, values) {
        if (kind === 'qemu') {
            var qemuValues = normalizeQemu(clone(values));
            var nodename = qemuValues.nodename;
            delete qemuValues.nodename;
            delete qemuValues.delete;

            Proxmox.Utils.API2Request({
                url: '/nodes/' + nodename + '/qemu',
                waitMsgTarget: owner,
                method: 'POST',
                params: qemuValues,
                success: function() {
                    owner.close();
                },
                failure: function(response) {
                    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
                },
            });
            return;
        }

        var lxcValues = clone(values);
        var lxcNode = lxcValues.nodename;
        delete lxcValues.nodename;
        delete lxcValues.delete;
        lxcValues = normalizeLxcSubmit(lxcValues);

        Proxmox.Utils.API2Request({
            url: '/nodes/' + lxcNode + '/lxc',
            waitMsgTarget: owner,
            method: 'POST',
            params: lxcValues,
            success: function(response) {
                Ext.create('Proxmox.window.TaskViewer', {
                    autoShow: true,
                    upid: response.result.data,
                });
                owner.close();
            },
            failure: function(response) {
                Ext.Msg.alert(gettext('Error'), response.htmlStatus);
            },
        });
    }

    function setupWindow(owner, kind, originalItems) {
        var sections = originalItems.slice(0, originalItems.length - 1);
        var settingsCard = buildOneShotCard(kind, owner, sections);
        var confirmCard = buildConfirmCard(kind, owner);
        var size = getViewportSize();
        var width = Math.min(Math.max(720, size.width - 40), size.width - 20);
        var height = Math.min(Math.max(560, size.height - 40), size.height - 20);

        Ext.apply(owner, {
            items: [settingsCard, confirmCard],
            width: width,
            height: height,
            maximized: false,
            resizable: true,
            constrainHeader: true,
        });

        owner.on('afterrender', function() {
            var tp = owner.down('#wizcontent');
            if (tp && tp.tabBar) {
                tp.tabBar.hide();
            }

            var submit = owner.down('#submit');
            if (submit) {
                submit.setText(gettext('Create'));
            }

            ensureAdvancedToggle(owner);
            bindTemplatePreview(owner, kind);

            owner._oneshotResizeHandler = function() {
                fitWindowToViewport(owner);
            };
            Ext.on('resize', owner._oneshotResizeHandler);
            owner.on(
                'destroy',
                function() {
                    if (owner._oneshotResizeHandler) {
                        Ext.un('resize', owner._oneshotResizeHandler);
                        owner._oneshotResizeHandler = null;
                    }
                },
                owner,
                { single: true },
            );

            fitWindowToViewport(owner);
        }, owner, { single: true });
    }

    Ext.override(PVE.qemu.CreateWizard, {
        initComponent: function() {
            var me = this;
            setupWindow(me, 'qemu', clone(PVE.qemu.CreateWizard.prototype.items || me.items || []));

            if (me.subject && !me.title) {
                me.title = Proxmox.Utils.dialog_title(me.subject, true, false);
            }

            PVE.window.Wizard.prototype.initComponent.apply(me, arguments);
        },
    });

    Ext.override(PVE.lxc.CreateWizard, {
        initComponent: function() {
            var me = this;
            setupWindow(me, 'lxc', clone(PVE.lxc.CreateWizard.prototype.items || me.items || []));

            if (me.subject && !me.title) {
                me.title = Proxmox.Utils.dialog_title(me.subject, true, false);
            }

            PVE.window.Wizard.prototype.initComponent.apply(me, arguments);
        },
    });
})();
