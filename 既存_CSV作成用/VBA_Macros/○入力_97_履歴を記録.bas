Attribute VB_Name = "○入力_97_履歴を記録"
Option Explicit

Sub 履歴を記録()

Dim Cod As String
Dim ws As Worksheet

Set ws = ThisWorkbook.Worksheets("情報")

With UserForm1
 Cod = .TextBox1.Value
End With

With ws.UsedRange
 If Cod <> "" Then
  .Find("物件コード").Offset(0, 1).Value = Cod
 End If
End With

Call 一時フォルダを削除

End Sub

Private Sub 一時フォルダを削除()

Dim Dflt As String
Dim fol As String, fList As String

Dflt = GetMyPath
fol = Dir(Dflt & "一時画像保存", vbDirectory)
If fol <> "" Then
  Dim objFSO As Object
  Dim strFolderPath As String
  
  Set objFSO = CreateObject("Scripting.FileSystemObject")
  strFolderPath = Dflt & fol

  objFSO.DeleteFolder strFolderPath

End If

End Sub
