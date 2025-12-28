Attribute VB_Name = "☆表示オプション"
Option Explicit

Function GetOPT() As String

Dim Opt As Boolean
Dim Usr As String
Dim Col As Range


Usr = Environ("username")
Set Col = ThisWorkbook.Worksheets("設定").UsedRange.Find("隠し表示").EntireColumn
If Application.WorksheetFunction.CountIf(Col, Usr) > 0 Then
 Opt = True
Else
 Opt = False
End If

GetOPT = Opt

End Function
