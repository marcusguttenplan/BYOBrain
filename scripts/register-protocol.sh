#!/bin/bash

# BYOBrain Protocol Registration Script (macOS)
# This script registers the byobrain:// scheme to open the local dashboard.

APP_NAME="BYOBrainHandler"
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="${SCRIPTS_DIR}/${APP_NAME}.app"

echo "🚀 Registering byobrain:// protocol handler..."

# 1. Create a minimal AppleScript bundle to handle the URL
rm -rf "$APP_PATH"

# Template for the app that parses the byobrain:// URL and opens the browser
# byobrain://project/type/slug -> http://localhost:PORT/project/type/slug
REPO_ROOT="$(cd "${SCRIPTS_DIR}/.." && pwd)"
PORT_FILE="${REPO_ROOT}/.dashboard_port"

cat <<EOF > handler.applescript
on open location this_URL
    set AppleScript's text item delimiters to "byobrain://"
    set components to text items of this_URL
    set path_part to item 2 of components
    
    -- Handle cases where there might be triple slashes or leading slash
    if path_part starts with "/" then
        set path_part to text 2 thru -1 of path_part
    end if
    
    -- Determine the port via grep (numeric-only, robust)
    set thePort to "3000" -- Initial guess
    try
        set thePort to (do shell script "grep -o '^[0-9]*' " & quoted form of "${PORT_FILE}")
    on error
        -- If file missing or error, keep 3000
    end try
    
    if thePort is "" then set thePort to "3000"
    
    set target_URL to "http://localhost:" & thePort & "/" & path_part
    do shell script "open " & quoted form of target_URL
end open location
EOF

# 2. Compile into an .app
osacompile -o "$APP_PATH" handler.applescript
rm handler.applescript

# 3. Update the Info.plist to register the protocol
PLIST="${APP_PATH}/Contents/Info.plist"

plutil -insert CFBundleURLTypes -xml "<array><dict><key>CFBundleURLName</key><string>BYOBrain Protocol</string><key>CFBundleURLSchemes</key><array><string>byobrain</string></array></dict></array>" "$PLIST"

# 4. Refresh Launch Services to recognize the new handler
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "$APP_PATH"

echo "✅ Protocol 'byobrain://' registered successfully!"
echo "📍 Handler App Location: $APP_PATH"
echo "💡 You can now use links like: byobrain://byobrain/plan/dashboard-revamp"
