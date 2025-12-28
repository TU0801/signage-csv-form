Attribute VB_Name = "◇CSV出力_03_出力処理"
Option Explicit

Sub CSV出力処理()

With Application
 .ScreenUpdating = False
 .EnableEvents = False
 .DisplayAlerts = False
 .Calculation = xlCalculationManual
End With

Dim mStr As String
Dim rList As String, fName As String
Dim i As Long

rList = ""
With UserForm2.ListBox1
 For i = 1 To .ListCount - 1
  If .Selected(i) = True Then
   rList = rList & .List(i, 0) & "/"
  End If
 Next i
End With

If rList <> "" Then
 Call 処理開始(rList, fName)
 Call Excelレポート出力(rList, fName)
 mStr = "CSVファイルを作成しました。"
Else
 mStr = "対象が選択されていません。"
End If

With Application
 .Calculation = xlCalculationAutomatic
 .DisplayAlerts = True
 .EnableEvents = True
 .ScreenUpdating = True
End With

MsgBox mStr, vbInformation Or vbSystemModal

End Sub

Private Sub 処理開始(ByVal rList As String, ByRef fName As String)

Dim fol As String ', fName As String
Dim R As Long, sR As Long, mR As Long, C() As Long
Dim wb As Workbook, ws As Worksheet, Sh As Worksheet

Call 保存フォルダ設定(fol)
Call CSV作成用の行列番号取得(Sh, sR, mR, C)

Sh.Copy
Set wb = ActiveWorkbook
Set ws = Worksheets(1)

rList = "/" & sR - 1 & "/" & rList
For R = mR To 1 Step -1
 If InStr(rList, "/" & R & "/") = 0 Then
  ws.Rows(R).Delete
 End If
Next R

With UserForm2
 fName = .TextBox1.Value & "-" & .ComboBox2.Value & "-" & Format(Date, "yyyymmdd") & " " & Format(Now, "hhmmss") & ".csv"
End With

wb.SaveAs Filename:=fol & fName, FileFormat:=xlCSV
wb.Close

End Sub

Private Sub 保存フォルダ設定(ByRef fol As String)

Dim sFol As String

fol = GetMyPath & "アップロード用CSV"
If Dir(fol, vbDirectory) = "" Then MkDir fol

fol = fol & "\"

End Sub
