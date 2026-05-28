#!/usr/bin/env python3

import os
import json
import re
import sys

if len(sys.argv) == 1 or not sys.argv[1]:
    raise SystemExit('Build dir missing.')

proj_dir = os.path.join(os.path.split(os.path.abspath(__file__))[0], '..')
build_dir = os.path.abspath(sys.argv[1])

version = ''
with open(os.path.join(proj_dir, 'dist', 'version')) as f:
    version = f.read().strip()

manifest_out = {}
manifest_out_file = os.path.join(build_dir, 'manifest.json')
with open(manifest_out_file) as f:
    manifest_out = json.load(f)

manifest_out['version'] = version

# Inject the update manifest URL when provided (set by CI for
# self-hosted CRX distribution via GitHub Pages). When absent
# (e.g. local builds), the extension has no auto-update channel.
# Presence of UPDATE_MANIFEST_URL also marks this as a production
# distribution build, which suppresses upstream's "development
# build" name suffix below.
update_manifest_url = os.environ.get('UPDATE_MANIFEST_URL', '').strip()
is_production_build = bool(update_manifest_url)
if update_manifest_url:
    manifest_out['update_url'] = update_manifest_url

# Development build? If so, modify name accordingly. Upstream tags
# stable releases with 3-component versions (e.g. 1.71.1), so this
# branch never fires for their official builds. This fork always
# produces 4-component versions (upstream_4th * 1000 + run_number),
# which would otherwise always trigger the dev-build label — skip
# it when we know this is a production build.
if not is_production_build:
    match = re.search(r'^\d+\.\d+\.\d+\.\d+$', version)
    if match:
        manifest_out['name'] += ' development build'
        manifest_out['short_name'] += ' dev build'
        manifest_out['action']['default_title'] += ' dev build'

with open(manifest_out_file, 'w') as f:
    json.dump(manifest_out, f, indent=2, separators=(',', ': '), sort_keys=True)
    f.write('\n')
