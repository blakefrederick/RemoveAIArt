#!/usr/bin/env python3
"""
Simple HTTP server for testing the RemoveAIArt Chrome extension.
Serves files from the current directory on localhost:8000
"""

import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers to allow cross-origin requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def start_server():
    PORT = 8000
    
    # Change to the directory containing this script
    os.chdir(Path(__file__).parent)
    
    Handler = CustomHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"🚀 RemoveAIArt Test Server")
        print(f"📂 Serving files from: {os.getcwd()}")
        print(f"🌐 Server running at: http://localhost:{PORT}")
        print(f"🧪 Test page: http://localhost:{PORT}/test.html")
        print(f"⚙️  Options page: http://localhost:{PORT}/options.html")
        print(f"\n💡 Tips:")
        print(f"   - Make sure your extension is loaded in Chrome")
        print(f"   - Right-click on images to test the extension")
        print(f"   - Check extension storage in DevTools > Application > Storage")
        print(f"\n🛑 Press Ctrl+C to stop the server")
        print("=" * 60)
        
        try:
            # Auto-open the test page
            webbrowser.open(f'http://localhost:{PORT}/test.html')
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n👋 Server stopped.")

if __name__ == "__main__":
    start_server()
