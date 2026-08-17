Set sh = CreateObject("WScript.Shell")
sh.Run ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8001 --logfile "C:\Users\Tomio\Desktop\ot-idle\tibia-idle\server\cloudflared-tunnel.log" --loglevel info", 0, False

