#!/bin/bash
# Proxmox Plugin Manager - Main Installer
set -euo pipefail

[ "$EUID" -ne 0 ] && echo "Error: root privileges required" && exit 1

JS_FILE="/usr/share/pve-manager/js/pvemanagerlib.js"
PLUGIN_DIR="/usr/share/pve-manager/plugins"
API2_FILE="/usr/share/perl5/PVE/API2.pm"
PERL_PLUGIN_API="/usr/share/perl5/PVE/API2/PluginManager.pm"
SERVICE_FILE="/etc/systemd/system/pve-plugin-api.service"
PYTHON_API="/usr/local/bin/pve-plugin-api.py"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PM_PLUGIN_NAME="plugin-manager"
PM_BACKUP_ROOT="/usr/share/pve-manager/plugin-backups"
. "$SCRIPT_DIR/plugin-backup.sh"

restore_previous_backup() {
    pm_restore_latest_backup
}

uninstall() {
    echo "Uninstalling..."

    systemctl stop pve-plugin-api.service 2>/dev/null || true
    systemctl disable pve-plugin-api.service 2>/dev/null || true
    rm -f "$SERVICE_FILE" "$PYTHON_API"
    rm -rf "$PLUGIN_DIR"
    rm -f "$PERL_PLUGIN_API"
    sed -i '/use PVE::API2::PluginManager;/d' "$API2_FILE"
    sed -i '/subclass => "PVE::API2::PluginManager", path => "pluginmanager"/d' "$API2_FILE"

    if restore_previous_backup; then
        rm -f "$PM_BACKUP_ROOT/$PM_PLUGIN_NAME/latest"
    fi

    systemctl daemon-reload

    systemctl restart pveproxy pvedaemon
    echo "Uninstalled"
}

if [ "${1:-}" = "uninstall" ]; then
    uninstall
    exit 0
fi

echo "Installing plugin manager..."

pm_backup_file "$JS_FILE"
pm_backup_file "$API2_FILE"
pm_backup_file "$PLUGIN_DIR"

pm_backup_file "$SERVICE_FILE"
pm_backup_file "$PYTHON_API"
pm_backup_file "$PERL_PLUGIN_API"

rm -rf "$PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
cp "$SCRIPT_DIR/plugin-backup.sh" "$PLUGIN_DIR/"
cp -r "$SCRIPT_DIR"/console-tab "$SCRIPT_DIR"/oneshot-create "$SCRIPT_DIR"/paste-type "$SCRIPT_DIR"/xterm-clipboard "$SCRIPT_DIR"/vm-folders "$SCRIPT_DIR"/firewall-batch "$PLUGIN_DIR/"
chmod +x "$PLUGIN_DIR"/*/plugin.sh

echo "Installing Python API..."
cp "$SCRIPT_DIR/pve-plugin-api.py" "$PYTHON_API"
chmod +x "$PYTHON_API"
cp "$SCRIPT_DIR/pve-plugin-api.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable pve-plugin-api.service
systemctl restart pve-plugin-api.service
sleep 1
echo "Python API started on port 8007"

cat > "$PERL_PLUGIN_API" <<'PMEOF'
package PVE::API2::PluginManager;
use strict;
use warnings;
use utf8;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::Tools;
use HTTP::Tiny;
use JSON;
use Encode qw(decode_utf8);
use base qw(PVE::RESTHandler);

my $PLUGIN_SERVICE = 'http://127.0.0.1:8007';
my $FOLDERS_FILE = '/etc/pve/vm-folders.json';

sub api_request {
    my ($method, $path, $payload) = @_;

    my $http = HTTP::Tiny->new(timeout => 35);
    my %args = ( headers => { 'Content-Type' => 'application/json' } );
    $args{content} = encode_json($payload) if defined($payload);

    my $response;
    if ($method eq 'GET') {
        $response = $http->get($PLUGIN_SERVICE . $path, \%args);
    } else {
        $response = $http->post($PLUGIN_SERVICE . $path, \%args);
    }

    die "API error: $response->{status}\n" if !$response->{success};
    return decode_json($response->{content});
}

__PACKAGE__->register_method({
    name => 'plugins',
    path => 'plugins',
    method => 'GET',
    permissions => { check => ['perm', '/', ['Sys.Audit']] },
    returns => { type => 'array' },
    code => sub {
        my $data = api_request('GET', '/plugins');
        return $data->{plugins} // [];
    }
});

__PACKAGE__->register_method({
    name => 'install',
    path => 'install',
    method => 'POST',
    protected => 1,
    permissions => { check => ['perm', '/', ['Sys.Modify']] },
    parameters => {
        additionalProperties => 0,
        properties => { plugin => { type => 'string' } }
    },
    returns => { type => 'string' },
    code => sub {
        my ($param) = @_;
        my $rpcenv = PVE::RPCEnvironment::get();
        my $authuser = $rpcenv->get_user();

        return $rpcenv->fork_worker('plugininstall', $param->{plugin}, $authuser, sub {
            print "===========================================\n";
            print "Installing plugin: $param->{plugin}\n";
            print "===========================================\n\n";

            my $data = api_request('POST', '/install', { plugin => $param->{plugin} });

            if ($data->{output}) {
                print "--- Install script output ---\n";
                print decode_utf8($data->{output}) . "\n";
                print "---------------------------------------\n\n";
            }

            if ($data->{error}) {
                print "ERROR: " . decode_utf8($data->{error}) . "\n";
            }

            die "Installation failed\n" if !$data->{success};

            print "===========================================\n";
            print " Installation completed successfully!\n";
            print "===========================================\n\n";
            print "Reload the web page (Ctrl+F5) to see the changes.\n";
        });
    }
});

__PACKAGE__->register_method({
    name => 'uninstall',
    path => 'uninstall',
    method => 'POST',
    protected => 1,
    permissions => { check => ['perm', '/', ['Sys.Modify']] },
    parameters => {
        additionalProperties => 0,
        properties => { plugin => { type => 'string' } }
    },
    returns => { type => 'string' },
    code => sub {
        my ($param) = @_;
        my $rpcenv = PVE::RPCEnvironment::get();
        my $authuser = $rpcenv->get_user();

        return $rpcenv->fork_worker('pluginuninstall', $param->{plugin}, $authuser, sub {
            print "===========================================\n";
            print "Uninstalling plugin: $param->{plugin}\n";
            print "===========================================\n\n";

            my $data = api_request('POST', '/uninstall', { plugin => $param->{plugin} });

            if ($data->{output}) {
                print "--- Uninstall script output ---\n";
                print decode_utf8($data->{output}) . "\n";
                print "-------------------------------------------\n\n";
            }

            if ($data->{error}) {
                print "ERROR: " . decode_utf8($data->{error}) . "\n";
            }

            die "Uninstall failed\n" if !$data->{success};

            print "===========================================\n";
            print " Uninstall completed successfully!\n";
            print "===========================================\n";
        });
    }
});

__PACKAGE__->register_method({
    name => 'get_folders',
    path => 'folders',
    method => 'GET',
    permissions => { check => ['perm', '/', ['Sys.Audit']] },
    returns => { type => 'object' },
    code => sub {
        return {} unless -e $FOLDERS_FILE;
        my $content = PVE::Tools::file_get_contents($FOLDERS_FILE);
        return decode_json($content);
    }
});

__PACKAGE__->register_method({
    name => 'set_folders',
    path => 'folders',
    method => 'PUT',
    protected => 1,
    permissions => { check => ['perm', '/', ['Sys.Modify']] },
    parameters => {
        additionalProperties => 0,
        properties => { data => { type => 'string' } }
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        PVE::Tools::file_set_contents($FOLDERS_FILE, $param->{data});
        return undef;
    }
});

1;
PMEOF

grep -q "use PVE::API2::PluginManager;" "$API2_FILE" || sed -i '19a use PVE::API2::PluginManager;' "$API2_FILE"
grep -q 'subclass => "PVE::API2::PluginManager", path => "pluginmanager"' "$API2_FILE" || sed -i '/^1;$/i __PACKAGE__->register_method({ subclass => "PVE::API2::PluginManager", path => "pluginmanager" });' "$API2_FILE"

cat > /tmp/plugin-widget.js <<'EOF'
Ext.define('PVE.dc.PluginGrid', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pvePluginGrid',
    stateful: true,
    stateId: 'grid-dc-plugins',

    initComponent: function() {
        var me = this;

        me.store = Ext.create('Ext.data.Store', {
            fields: ['id', 'name', 'description', 'version', { name: 'enabled', type: 'boolean' }],
            data: [],
        });

        Ext.apply(me, {
            store: me.store,
            columns: [
                { text: 'Plugin', dataIndex: 'name', flex: 2 },
                { text: 'Description', dataIndex: 'description', flex: 3 },
                { text: 'Version', dataIndex: 'version', width: 90 },
                {
                    text: 'Status',
                    dataIndex: 'enabled',
                    width: 90,
                    renderer: function(value) {
                        return value
                            ? '<span style="color:green">Enabled</span>'
                            : '<span style="color:gray">Disabled</span>';
                    },
                },
            ],
            tbar: [
                {
                    text: 'Refresh',
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        me.loadPlugins();
                    },
                },
                {
                    text: 'Install',
                    iconCls: 'fa fa-download',
                    handler: function() {
                        me.runAction('install');
                    },
                },
                {
                    text: 'Uninstall',
                    iconCls: 'fa fa-trash',
                    handler: function() {
                        me.runAction('uninstall');
                    },
                },
            ],
        });

        me.callParent();
        me.loadPlugins();
    },

    loadPlugins: function() {
        var me = this;
        Proxmox.Utils.API2Request({
            url: '/api2/extjs/pluginmanager/plugins',
            method: 'GET',
            success: function(response) {
                me.store.loadData(response.result.data || []);
            },
            failure: function(response) {
                var msg = 'Failed to load the plugin list';
                if (response.result && response.result.message) {
                    msg = response.result.message;
                }
                Ext.Msg.alert('Error', msg);
            },
        });
    },

    runAction: function(action) {
        var me = this;
        var selection = me.getSelectionModel().getSelection()[0];
        if (!selection) {
            Ext.Msg.alert('Error', 'Select a plugin');
            return;
        }

        var title = action === 'install' ? 'Install Plugin' : 'Uninstall Plugin';
        var question = selection.get('name') + (action === 'install' ? ' will be installed. Continue?' : ' will be uninstalled. Continue?');

        Ext.Msg.confirm(title, question, function(button) {
            if (button !== 'yes') {
                return;
            }

            Proxmox.Utils.API2Request({
                url: '/api2/extjs/pluginmanager/' + action,
                method: 'POST',
                params: { plugin: selection.get('id') },
                success: function(response) {
                    Ext.create('Proxmox.window.TaskViewer', {
                        autoShow: true,
                        upid: response.result.data,
                        taskDone: function() {
                            me.loadPlugins();
                        },
                    });
                },
                failure: function(response) {
                    var msg = 'Request failed';
                    if (response.result && response.result.message) {
                        msg = response.result.message;
                    }
                    Ext.Msg.alert('Error', msg);
                },
            });
        });
    },
});
EOF

python3 <<'PY'
import re
from pathlib import Path

js_file = Path('/usr/share/pve-manager/js/pvemanagerlib.js')
widget_code = Path('/tmp/plugin-widget.js').read_text()
content = js_file.read_text()

if 'Ext.define(\'PVE.dc.PluginGrid\'' not in content:
    content = widget_code + '\n' + content

if "itemId: 'plugins'" not in content:
    pattern = re.compile(
        r"(\{\n\s*xtype: 'pveDcOptionView',\n\s*title: gettext\('Options'\),\n\s*iconCls: 'fa fa-gear',\n\s*itemId: 'options',\n\s*\},)",
        re.M,
    )
    replacement = (
        r"\1\n"
        "                {\n"
        "                    xtype: 'pvePluginGrid',\n"
        "                    title: gettext('Plugins'),\n"
        "                    iconCls: 'fa fa-puzzle-piece',\n"
        "                    itemId: 'plugins',\n"
        "                },"
    )
    content, count = pattern.subn(replacement, content, count=1)
    if count == 0:
        raise SystemExit('Unable to insert Plugins tab into pvemanagerlib.js')

js_file.write_text(content)
PY

systemctl restart pveproxy pvedaemon
echo "Installation completed - clear cache and reload Proxmox"
