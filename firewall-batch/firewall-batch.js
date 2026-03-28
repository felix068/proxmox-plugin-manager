(function() {
  'use strict';

  const LOG_PREFIX = '[Firewall Batch]';
  const ACTIONS = ['ACCEPT', 'REJECT', 'DROP'];
  const DIRECTION_MODES = [
    ['in', 'Inbound only'],
    ['out', 'Outbound only'],
    ['both', 'Inbound + Outbound'],
  ];
  const COMMON_PROTOCOLS = [
    ['', 'Any'],
    ['tcp', 'TCP'],
    ['udp', 'UDP'],
    ['icmp', 'ICMP'],
    ['icmpv6', 'ICMPv6'],
  ];

  function log() {
    console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
  }

  function trim(value) {
    return String(value || '').trim();
  }

  function truthy(value) {
    return value === true || value === 1 || value === '1' || value === 'on' || value === 'true';
  }

  function normalizeListValue(value) {
    if (Array.isArray(value)) {
      return value
        .map(function(entry) {
          return trim(entry);
        })
        .filter(Boolean);
    }

    return splitMulti(value).filter(Boolean);
  }

  function splitMulti(value) {
    const raw = trim(value);
    if (!raw) {
      return [''];
    }

    const unique = [];
    const seen = new Set();
    raw.split(/[\n,;]+/).map(function(entry) {
      return entry.trim();
    }).filter(Boolean).forEach(function(entry) {
      if (!seen.has(entry)) {
        seen.add(entry);
        unique.push(entry);
      }
    });

    return unique.length ? unique : [''];
  }

  function extractBaseUrlParts(baseUrl) {
    const match = String(baseUrl || '').match(/^\/nodes\/([^/]+)\/(qemu|lxc)\/(\d+)/);
    if (!match) {
      return null;
    }
    return {
      node: match[1],
      type: match[2],
      id: match[3],
    };
  }

  function setFieldValue(field, value) {
    if (field && field.getValue() !== value) {
      field.setValue(value);
    }
  }

  function buildComment(comment, direction) {
    const trimmed = trim(comment);
    if (!trimmed) {
      return '';
    }
    return trimmed.replace(/\{dir\}/gi, direction);
  }

  function joinList(values) {
    return (values || [])
      .map(function(value) {
        return trim(value);
      })
      .filter(Boolean)
      .join(', ');
  }

  function createRuleTemplate(prefix, title) {
    return {
      xtype: 'fieldset',
      itemId: prefix + 'Fieldset',
      title: title,
      defaults: { anchor: '100%' },
      items: [{
        xtype: 'proxmoxKVComboBox',
        name: prefix + 'Action',
        fieldLabel: 'Action',
        value: 'ACCEPT',
        comboItems: ACTIONS.map(function(action) {
          return [action, action];
        }),
      }, {
        xtype: 'textfield',
        name: prefix + 'Macro',
        fieldLabel: 'Macro',
        emptyText: 'Optional firewall macro',
      }, {
        xtype: 'tagfield',
        name: prefix + 'Proto',
        fieldLabel: 'Protocol',
        editable: true,
        queryMode: 'local',
        filterPickList: true,
        forceSelection: false,
        displayField: 'label',
        valueField: 'value',
        value: [],
        store: Ext.create('Ext.data.Store', {
          fields: ['value', 'label'],
          data: COMMON_PROTOCOLS.map(function(entry) {
            return { value: entry[0], label: entry[1] };
          }),
        }),
        emptyText: 'Select one or more protocols',
      }, {
        xtype: 'textfield',
        name: prefix + 'Source',
        fieldLabel: 'Source(s)',
        emptyText: 'IP, CIDR, alias, IPSet, comma-separated',
      }, {
        xtype: 'textfield',
        name: prefix + 'Sport',
        fieldLabel: 'Source port(s)',
        emptyText: 'Optional, comma-separated',
      }, {
        xtype: 'textfield',
        name: prefix + 'Dest',
        fieldLabel: 'Destination(s)',
        emptyText: 'IP, CIDR, alias, IPSet, comma-separated',
      }, {
        xtype: 'textfield',
        name: prefix + 'Dport',
        fieldLabel: 'Destination port(s)',
        emptyText: 'Optional, comma-separated',
      }, {
        xtype: 'textfield',
        name: prefix + 'Comment',
        fieldLabel: 'Comment',
        emptyText: 'Optional, supports {dir}',
      }],
    };
  }

  function getTemplateValues(form, prefix) {
    return {
      action: trim(form.down('[name=' + prefix + 'Action]').getValue()) || 'ACCEPT',
      macro: trim(form.down('[name=' + prefix + 'Macro]').getValue()),
      proto: normalizeListValue(form.down('[name=' + prefix + 'Proto]').getValue()),
      source: trim(form.down('[name=' + prefix + 'Source]').getValue()),
      sport: trim(form.down('[name=' + prefix + 'Sport]').getValue()),
      dest: trim(form.down('[name=' + prefix + 'Dest]').getValue()),
      dport: trim(form.down('[name=' + prefix + 'Dport]').getValue()),
      comment: trim(form.down('[name=' + prefix + 'Comment]').getValue()),
    };
  }

  function serializeRules(rules) {
    return (rules || []).map(renderRule).join('\n');
  }

  function parseRuleLine(line) {
    const raw = trim(line);
    if (!raw || raw.startsWith('#')) {
      return null;
    }

    const commentParts = raw.split(/\s+#\s*/);
    const body = trim(commentParts[0]);
    const comment = trim(commentParts.slice(1).join(' # '));
    const tokens = body.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
      return null;
    }

    const rule = {
      type: tokens[0].toLowerCase(),
      action: tokens[1].toUpperCase(),
      enable: undefined,
      log: 'nolog',
      proto: [],
    };

    tokens.slice(2).forEach(function(token) {
      const normalized = token.trim();
      const keyValue = normalized.match(/^([a-z]+)=(.*)$/i);
      if (keyValue) {
        const key = keyValue[1].toLowerCase();
        const value = keyValue[2];
        if (key === 'macro') {
          rule.macro = value;
        } else if (key === 'src') {
          rule.source = value;
        } else if (key === 'dst') {
          rule.dest = value;
        } else if (key === 'sport') {
          rule.sport = value;
        } else if (key === 'dport') {
          rule.dport = value;
        } else if (key === 'log') {
          rule.log = value;
        } else if (key === 'enable') {
          rule.enable = truthy(value);
        } else if (key === 'proto') {
          rule.proto = splitMulti(value);
        } else if (key === 'comment') {
          rule.comment = value;
        }
        return;
      }

      if (['tcp', 'udp', 'icmp', 'icmpv6', 'any'].includes(normalized.toLowerCase())) {
        rule.proto = normalized.toLowerCase() === 'any' ? [] : [normalized.toLowerCase()];
      } else if (!rule.proto.length && !rule.macro) {
        rule.proto = [normalized.toLowerCase()];
      }
    });

    if (comment) {
      rule.comment = comment;
    }

    return rule;
  }

  function parseRuleText(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(parseRuleLine)
      .filter(Boolean);
  }

  function ruleToTemplate(rule) {
    return {
      action: rule.action || 'ACCEPT',
      macro: trim(rule.macro),
      proto: normalizeListValue(rule.proto),
      source: trim(rule.source),
      sport: trim(rule.sport),
      dest: trim(rule.dest),
      dport: trim(rule.dport),
      comment: trim(rule.comment),
    };
  }

  function getMirrorTemplate(form) {
    const outbound = getTemplateValues(form, 'out');
    return {
      action: outbound.action,
      macro: outbound.macro,
      proto: outbound.proto,
      source: outbound.dest,
      sport: outbound.dport,
      dest: outbound.source,
      dport: outbound.sport,
      comment: outbound.comment,
    };
  }

  function setTemplateDisabled(form, prefix, disabled) {
    [
      prefix + 'Action',
      prefix + 'Macro',
      prefix + 'Proto',
      prefix + 'Source',
      prefix + 'Sport',
      prefix + 'Dest',
      prefix + 'Dport',
      prefix + 'Comment',
    ].forEach(function(name) {
      const field = form.down('[name=' + name + ']');
      if (field) {
        field.setDisabled(disabled);
      }
    });
  }

  function syncInboundMirror(form) {
    const inbound = getMirrorTemplate(form);
    setFieldValue(form.down('[name=inAction]'), inbound.action);
    setFieldValue(form.down('[name=inMacro]'), inbound.macro);
    setFieldValue(form.down('[name=inProto]'), inbound.proto);
    setFieldValue(form.down('[name=inSource]'), inbound.source);
    setFieldValue(form.down('[name=inSport]'), inbound.sport);
    setFieldValue(form.down('[name=inDest]'), inbound.dest);
    setFieldValue(form.down('[name=inDport]'), inbound.dport);
    setFieldValue(form.down('[name=inComment]'), inbound.comment);
  }

  function applyModeState(form) {
    const mode = form.down('[name=directionMode]').getValue();
    const mirror = !!form.down('[name=mirrorInbound]').getValue();
    const inboundFieldset = form.down('#inFieldset');
    const outboundFieldset = form.down('#outFieldset');
    const mirrorField = form.down('[name=mirrorInbound]');

    inboundFieldset.setHidden(mode === 'out');
    outboundFieldset.setHidden(mode === 'in');
    inboundFieldset.setDisabled(mode === 'out' || (mode === 'both' && mirror));
    outboundFieldset.setDisabled(mode === 'in');
    mirrorField.setDisabled(mode !== 'both');

    if (mode === 'both' && mirror) {
      syncInboundMirror(form);
    }

    setTemplateDisabled(form, 'in', mode === 'out' || (mode === 'both' && mirror));
    setTemplateDisabled(form, 'out', mode === 'in');
  }

  function collectTemplateState(form) {
    return {
      directionMode: form.down('[name=directionMode]').getValue(),
      mirrorInbound: !!form.down('[name=mirrorInbound]').getValue(),
      enable: !!form.down('[name=enableRules]').getValue(),
      log: trim(form.down('[name=logLevel]').getValue()) || 'nolog',
      inbound: getTemplateValues(form, 'in'),
      outbound: getTemplateValues(form, 'out'),
    };
  }

  function buildDirectionRules(direction, template, common) {
    const rules = [];
    const action = trim(template.action) || 'ACCEPT';
    const macro = trim(template.macro);
    const protocols = macro ? [''] : normalizeProtocols(template.proto);
    const sources = splitMulti(template.source);
    const sourcePorts = macro ? [''] : splitMulti(template.sport);
    const destinations = splitMulti(template.dest);
    const destPorts = macro ? [''] : splitMulti(template.dport);
    const comment = buildComment(template.comment, direction);

    sources.forEach(function(source) {
      sourcePorts.forEach(function(sport) {
        destinations.forEach(function(dest) {
          destPorts.forEach(function(dport) {
            protocols.forEach(function(proto) {
              const rule = {
                type: direction,
                action: action,
                enable: common.enable ? 1 : 0,
                log: common.log,
              };

              if (macro) {
                rule.macro = macro;
              } else if (proto) {
                rule.proto = proto;
              }

              if (source) {
                rule.source = source;
              }
              if (sport) {
                rule.sport = sport;
              }
              if (dest) {
                rule.dest = dest;
              }
              if (dport) {
                rule.dport = dport;
              }
              if (comment) {
                rule.comment = comment;
              }

              rules.push(rule);
            });
          });
        });
      });
    });

    return rules;
  }

  function normalizeProtocols(value) {
    const entries = normalizeListValue(value);
    if (!entries.length) {
      return [''];
    }

    const filtered = entries.filter(function(entry) {
      return entry !== '';
    });

    return filtered.length ? filtered : [''];
  }

  function buildTemplateRules(state) {
    const rules = [];

    if (state.directionMode === 'out' || state.directionMode === 'both') {
      const outbound = state.outbound;
      rules.push.apply(rules, buildDirectionRules('out', outbound, state));
    }

    if (state.directionMode === 'in' || state.directionMode === 'both') {
      const inbound = state.directionMode === 'both' && state.mirrorInbound
        ? getMirrorTemplateFromState(state.outbound)
        : state.inbound;
      rules.push.apply(rules, buildDirectionRules('in', inbound, state));
    }

    return rules;
  }

  function collectTextState(form) {
    return {
      enable: !!form.down('[name=enableRules]').getValue(),
      log: trim(form.down('[name=logLevel]').getValue()) || 'nolog',
      text: trim(form.down('[name=preview]').getValue()),
    };
  }

  function buildRules(state) {
    return parseRuleText(state.text).map(function(rule) {
      if (rule.enable === undefined) {
        rule.enable = state.enable ? 1 : 0;
      } else {
        rule.enable = truthy(rule.enable) ? 1 : 0;
      }
      rule.log = rule.log || state.log;
      return rule;
    });
  }

  function getMirrorTemplateFromState(outbound) {
    return {
      action: outbound.action,
      macro: outbound.macro,
      proto: outbound.proto,
      source: outbound.dest,
      sport: outbound.dport,
      dest: outbound.source,
      dport: outbound.sport,
      comment: outbound.comment,
    };
  }

  function renderRule(rule) {
    const parts = [rule.type.toUpperCase(), rule.action];

    if (rule.enable !== undefined) {
      parts.push('enable=' + (rule.enable ? '1' : '0'));
    }

    if (rule.macro) {
      parts.push('macro=' + rule.macro);
    } else if (rule.proto) {
      parts.push(rule.proto);
    }

    if (rule.source) {
      parts.push('src=' + rule.source);
    }
    if (rule.sport) {
      parts.push('sport=' + rule.sport);
    }
    if (rule.dest) {
      parts.push('dst=' + rule.dest);
    }
    if (rule.dport) {
      parts.push('dport=' + rule.dport);
    }
    if (rule.log) {
      parts.push('log=' + rule.log);
    }
    if (rule.comment) {
      parts.push('# ' + rule.comment);
    }

    return parts.join(' ');
  }

  function normalizeRuleRecord(record) {
    return {
      type: trim(record.type || '').toLowerCase() || 'in',
      action: trim(record.action || '').toUpperCase() || 'ACCEPT',
      enable: record.enable === undefined ? 1 : (truthy(record.enable) ? 1 : 0),
      log: trim(record.log || '') || 'nolog',
      macro: trim(record.macro || ''),
      proto: normalizeListValue(record.proto || record.protocol || ''),
      source: trim(record.source || record.src || ''),
      sport: trim(record.sport || ''),
      dest: trim(record.dest || record.dst || ''),
      dport: trim(record.dport || ''),
      comment: trim(record.comment || ''),
    };
  }

  function fetchVmList(callback) {
    Proxmox.Utils.API2Request({
      url: '/api2/extjs/cluster/resources',
      method: 'GET',
      params: { type: 'vm' },
      success: function(response) {
        try {
          const records = (response.result.data || [])
            .filter(function(item) {
              return item && (item.type === 'qemu' || item.type === 'lxc');
            })
            .map(function(item) {
              return {
                node: trim(item.node),
                type: trim(item.type),
                vmid: String(item.vmid || item.id || ''),
                name: trim(item.name || item.text || ''),
                status: trim(item.status || ''),
              };
            })
            .sort(function(a, b) {
              const left = (a.node + ':' + a.vmid).toLowerCase();
              const right = (b.node + ':' + b.vmid).toLowerCase();
              return left.localeCompare(right);
            });
          callback(null, records);
        } catch (error) {
          callback(error);
        }
      },
      failure: function(response) {
        callback(new Error(response.htmlStatus || 'Failed to load VM list'));
      },
    });
  }

  function loadRulesFromSourceRecord(panel, record, previewField, countField, done) {
    const sourceNode = trim(record && record.get ? record.get('node') : record && record.node);
    const sourceType = trim(record && record.get ? record.get('type') : record && record.type) || 'qemu';
    const sourceId = trim(record && record.get ? record.get('vmid') : record && record.vmid);

    if (!sourceNode || !sourceId) {
      Ext.Msg.alert('Rule Builder', 'Please select a VM or CT first.');
      return;
    }

    const url = '/api2/extjs/nodes/' + encodeURIComponent(sourceNode) + '/' + sourceType + '/' + encodeURIComponent(sourceId) + '/firewall/rules';
    panel.setLoading('Loading source firewall rules...');

    Proxmox.Utils.API2Request({
      url: url,
      method: 'GET',
      success: function(response) {
        panel.setLoading(false);
        const rules = (response.result.data || []).map(normalizeRuleRecord);
        previewField.setReadOnly(false);
        previewField.setValue(serializeRules(rules));
        if (done) {
          done();
        }
      },
      failure: function(response) {
        panel.setLoading(false);
        Ext.Msg.alert(gettext('Error'), response.htmlStatus || 'Failed to load rules from source.');
      },
    });
  }

  function generatePreviewFromTemplates(form, previewField, countField) {
    applyModeState(form);
    const state = collectTemplateState(form);
    const rules = buildTemplateRules(state);
    previewField.setValue(serializeRules(rules));
    return rules;
  }

  function updateTextStats(form, previewField, countField) {
    const rules = buildRules(collectTextState(form));
    countField.setValue(rules.length + ' rule(s) in editor');
    return rules;
  }

  function openCloneWindow(panel, previewField, countField) {
    const store = Ext.create('Ext.data.Store', {
      fields: ['node', 'type', 'vmid', 'name', 'status'],
      data: [],
    });

    const searchField = Ext.create('Ext.form.field.Text', {
      emptyText: 'Search by node, ID or name...',
      listeners: {
        change: function(field, value) {
          const query = trim(value).toLowerCase();
          store.clearFilter();
          if (!query) {
            return;
          }
          store.filterBy(function(record) {
            return [record.get('node'), record.get('type'), record.get('vmid'), record.get('name'), record.get('status')]
              .join(' ')
              .toLowerCase()
              .includes(query);
          });
        },
      },
    });

    const grid = Ext.create('Ext.grid.Panel', {
      store: store,
      selModel: { mode: 'SINGLE' },
      columns: [{ text: 'Node', dataIndex: 'node', flex: 1 }, {
        text: 'Type', dataIndex: 'type', width: 80,
        renderer: function(value) { return value === 'lxc' ? 'CT' : 'VM'; },
      }, { text: 'ID', dataIndex: 'vmid', width: 90 }, { text: 'Name', dataIndex: 'name', flex: 2 }, { text: 'Status', dataIndex: 'status', width: 100 }],
      tbar: [searchField],
      listeners: {
        itemdblclick: function(_grid, record) {
          loadRulesFromSourceRecord(panel, record, previewField, countField, function() {
            win.close();
          });
        },
      },
    });

    const win = Ext.create('Ext.window.Window', {
      title: 'Clone Firewall Rules from VM/CT',
      width: 900,
      height: 560,
      modal: true,
      layout: 'fit',
      items: [grid],
      buttons: [{
        text: 'Cancel',
        handler: function() {
          win.close();
        },
      }, {
        text: 'Clone Selected Rules',
        handler: function() {
          const record = grid.getSelectionModel().getSelection()[0];
          if (!record) {
            Ext.Msg.alert('Clone Firewall Rules', 'Select a VM or CT first.');
            return;
          }

          loadRulesFromSourceRecord(panel, record, previewField, countField, function() {
            win.close();
          });
        },
      }],
      listeners: {
        show: function() {
          panel.setLoading('Loading VM/CT list...');
          fetchVmList(function(error, records) {
            panel.setLoading(false);
            if (error) {
              Ext.Msg.alert('Clone Firewall Rules', error.message || 'Failed to load VM list.');
              win.close();
              return;
            }
            store.loadData(records);
          });
        },
      },
    });

    win.show();
  }

  function createRules(panel, rules, done) {
    let index = 0;
    panel.setLoading('Creating firewall rules...');

    const next = function() {
      if (index >= rules.length) {
        panel.setLoading(false);
        panel.store.load();
        Ext.Msg.show({
          title: 'Rule Builder',
          msg: rules.length + ' rule(s) created.',
          icon: Ext.Msg.INFO,
          buttons: Ext.Msg.OK,
        });
        if (done) {
          done();
        }
        return;
      }

      const rule = Ext.apply({}, rules[index]);
      index += 1;

      Proxmox.Utils.API2Request({
        url: panel.base_url,
        method: 'POST',
        params: rule,
        failure: function(response) {
          panel.setLoading(false);
          Ext.Msg.alert(gettext('Error'), response.htmlStatus || 'Rule creation failed.');
        },
        success: function() {
          next();
        },
      });
    };

    next();
  }

  function openBuilderWindow(panel) {
    const outboundTemplate = createRuleTemplate('out', 'Outbound Template');
    const inboundTemplate = createRuleTemplate('in', 'Inbound Template');

    const form = Ext.create('Ext.form.Panel', {
      bodyPadding: 12,
      border: false,
      defaults: {
        anchor: '100%',
      },
      items: [{
        xtype: 'displayfield',
        value: 'Use templates to generate rules, or paste/clone a rule list directly into the editor.',
      }, {
        xtype: 'fieldset',
        title: 'Batch Settings',
        defaults: { anchor: '100%' },
        items: [{
          xtype: 'proxmoxKVComboBox',
          name: 'directionMode',
          fieldLabel: 'Direction',
          value: 'both',
          comboItems: DIRECTION_MODES,
          listeners: {
            change: function() {
              applyModeState(form);
            },
          },
        }, {
          xtype: 'checkbox',
          name: 'mirrorInbound',
          boxLabel: 'Mirror inbound from outbound by default',
          checked: true,
          listeners: {
            change: function() {
              applyModeState(form);
            },
          },
        }, {
          xtype: 'checkbox',
          name: 'enableRules',
          boxLabel: 'Enable rules immediately after creation',
          checked: true,
        }, {
          xtype: 'displayfield',
          value: 'If enabled, new rules are active right away. If disabled, they stay turned off until you enable them manually.',
        }, {
          xtype: 'textfield',
          name: 'logLevel',
          fieldLabel: 'Log level',
          value: 'nolog',
        }],
      }, {
        xtype: 'fieldset',
        title: 'Templates',
        defaults: { anchor: '100%' },
        items: [{
          xtype: 'displayfield',
          value: 'Outbound is on the left and inbound can mirror it from the right when mirroring is enabled.',
        }, {
          xtype: 'container',
          layout: {
            type: 'hbox',
            align: 'stretch',
          },
          defaults: {
            flex: 1,
          },
          items: [Ext.apply(outboundTemplate, {
            margin: '0 8 0 0',
          }), inboundTemplate],
        }],
      }, {
        xtype: 'displayfield',
        name: 'ruleCount',
        value: '',
      }, {
        xtype: 'textareafield',
        name: 'preview',
        fieldLabel: 'Preview / Editor',
        labelAlign: 'top',
        height: 300,
        readOnly: false,
        emptyText: 'Paste firewall rules here, or use Generate / Clone to fill this editor.',
      }],
    });

    const previewField = form.down('[name=preview]');
    const countField = form.down('[name=ruleCount]');

    previewField.on('change', function() {
      updateTextStats(form, previewField, countField);
    });

    applyModeState(form);

    [
      'outAction',
      'outMacro',
      'outProto',
      'outSource',
      'outSport',
      'outDest',
      'outDport',
      'outComment',
    ].forEach(function(name) {
      const field = form.down('[name=' + name + ']');
      if (field) {
        field.on('change', function() {
          applyModeState(form);
        });
      }
    });

    const win = Ext.create('Ext.window.Window', {
      title: 'Rule Builder',
      width: 1180,
      maxWidth: Math.min(window.innerWidth - 40, 1180),
      modal: true,
      layout: 'fit',
      items: [form],
      buttons: [{
        text: 'Cancel',
        handler: function() {
          win.close();
        },
      }, {
        text: 'Generate from Templates',
        handler: function() {
          generatePreviewFromTemplates(form, previewField, countField);
        },
      }, {
        text: 'Clone from VM/CT...',
        handler: function() {
          openCloneWindow(panel, previewField, countField);
        },
      }, {
        text: 'Create Rules',
        handler: function() {
          const rules = buildRules(collectTextState(form));
          if (!rules.length) {
            Ext.Msg.alert('Rule Builder', 'Preview is empty.');
            return;
          }

          createRules(panel, rules, function() {
            win.close();
          });
        },
      }],
      listeners: {
        show: function() {
          updateTextStats(form, previewField, countField);
        },
      },
    });

    win.show();
  }

  function isTargetPanel(panel) {
    return !!panel && panel.firewall_type === 'vm';
  }

  function updateButtonState(panel) {
    if (!panel || !panel.batchBtn) {
      return;
    }
    panel.batchBtn.setDisabled(!panel.canEdit || !panel.base_url || !isTargetPanel(panel));
  }

  function injectButton(panel) {
    if (!isTargetPanel(panel) || panel.__firewallBatchInjected) {
      return;
    }

    const toolbar = panel.down('toolbar[dock="top"]') || panel.getDockedItems('toolbar[dock="top"]')[0];
    if (!toolbar) {
      Ext.Function.defer(function() {
        injectButton(panel);
      }, 50);
      return;
    }

    panel.__firewallBatchInjected = true;
    panel.batchBtn = Ext.create('Ext.Button', {
      text: 'Rule Builder',
      iconCls: 'fa fa-bolt',
      disabled: true,
      tooltip: 'Create one-way or mirrored firewall rule batches',
      handler: function() {
        openBuilderWindow(panel);
      },
    });

    const addIndex = panel.addBtn ? toolbar.items.indexOf(panel.addBtn) : -1;
    if (addIndex >= 0) {
      toolbar.insert(addIndex + 1, panel.batchBtn);
    } else {
      toolbar.add('-');
      toolbar.add(panel.batchBtn);
    }

    updateButtonState(panel);
  }

  function patchFirewallRules() {
    if (!PVE || !PVE.FirewallRules) {
      return false;
    }

    const proto = PVE.FirewallRules.prototype;
    if (proto.__firewallBatchPatched) {
      return true;
    }
    proto.__firewallBatchPatched = true;

    const originalInitComponent = proto.initComponent;
    proto.initComponent = function() {
      const result = originalInitComponent.apply(this, arguments);
      injectButton(this);
      return result;
    };

    const originalSetBaseUrl = proto.setBaseUrl;
    proto.setBaseUrl = function(url) {
      const result = originalSetBaseUrl.apply(this, arguments);
      injectButton(this);
      updateButtonState(this);
      return result;
    };

    Ext.ComponentQuery.query('pveFirewallRules').forEach(function(panel) {
      injectButton(panel);
      updateButtonState(panel);
    });

    log('patched firewall rules UI');
    return true;
  }

  function bootstrap() {
    if (typeof Ext === 'undefined' || typeof PVE === 'undefined' || typeof Proxmox === 'undefined' || !Proxmox.Utils || !Proxmox.Utils.API2Request || !PVE.FirewallRules) {
      return setTimeout(bootstrap, 100);
    }

    patchFirewallRules();
  }

  bootstrap();
})();
