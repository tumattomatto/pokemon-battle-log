Option Explicit

Const URL = "http://localhost:5173"

Dim shell, fso, appDir, nodeExe
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appDir

nodeExe = FindNode()
If nodeExe = "" Then
  shell.Run Quote(fso.BuildPath(appDir, "run-app.bat")), 1, True
  nodeExe = FindNode()
  If nodeExe = "" Then
    MsgBox "Node.js was not found. Please run run-app.bat once while connected to the internet.", vbExclamation, "Battle Log"
    WScript.Quit 1
  End If
End If

If Not IsServerReady() Then
  shell.Run Quote(nodeExe) & " " & Quote(fso.BuildPath(appDir, "server.js")), 0, False
  WaitForServer
End If

shell.Run URL, 1, False

Function FindNode()
  Dim localNode, exec, line
  localNode = fso.BuildPath(appDir, ".runtime\node\node.exe")

  If fso.FileExists(localNode) Then
    FindNode = localNode
    Exit Function
  End If

  On Error Resume Next
  Set exec = shell.Exec("where node")
  If Err.Number = 0 Then
    Do Until exec.StdOut.AtEndOfStream
      line = Trim(exec.StdOut.ReadLine())
      If line <> "" And fso.FileExists(line) Then
        FindNode = line
        Exit Function
      End If
    Loop
  End If
  Err.Clear
  On Error GoTo 0

  FindNode = ""
End Function

Function IsServerReady()
  Dim http
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 500, 500, 500, 500
  http.Open "GET", URL & "/api/data", False
  http.Send
  IsServerReady = (Err.Number = 0 And http.Status = 200)
  Err.Clear
  On Error GoTo 0
End Function

Sub WaitForServer()
  Dim i
  For i = 1 To 20
    WScript.Sleep 250
    If IsServerReady() Then Exit Sub
  Next
End Sub

Function Quote(value)
  Quote = """" & value & """"
End Function
