@echo off
cd /d "C:\Users\Tomio\Desktop\ot-idle\tibia-idle\server"
set PORT=8001
set TEST_SERVER=1
"C:\Program Files\nodejs\node.exe" server.js >> "C:\Users\Tomio\Desktop\ot-idle\tibia-idle\server\server-8001.log" 2>&1
