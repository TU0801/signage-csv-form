Attribute VB_Name = "◇CSV出力_04_レポート出力"
Option Explicit

Sub Excelレポート出力(ByVal rList As String, ByVal fName As String)
If UserForm2.CheckBox2.Value = False Then Exit Sub

Dim R As Long, Rx As Long
Dim sR As Long, mR As Long, C() As Long
Dim sRx As Long, mRx As Long, Cx() As Long
Dim awb As Workbook, aws As Worksheet, Gns As Worksheet
Dim ws As Worksheet

Set Gns = ThisWorkbook.Worksheets("レポート")
If Gns.Visible = False Then Gns.Visible = True
Gns.Copy

Set awb = ActiveWorkbook
Set aws = awb.Worksheets(1)
Gns.Visible = False

Set ws = ThisWorkbook.Worksheets("CSV作成用")

aws.Range("1:5").Find("※CSV出力レポート", lookat:=xlWhole).Value = "※CSV出力レポート：" & fName

Call レポートの行列番号取得(aws, sR, mR, C)
Call レポートの行列番号取得(ws, sRx, mRx, Cx)

Dim i As Long
Dim n As Long, Mx As Long

Mx = UBound(C)

R = sR - 1
Do While rList <> ""
 i = InStr(rList, "/")
 Rx = Left(rList, i - 1)
 rList = Right$(rList, Len(rList) - i)
 R = R + 1
 For n = 1 To Mx
  aws.Cells(R, C(n)).Value = ws.Cells(Rx, Cx(n)).Value
 Next n
Loop

Call 保存処理(awb, fName)

End Sub

Private Sub 保存処理(ByVal awb As Workbook, ByVal CSVname As String)

Dim fol As String, sFol As String
Dim wbn As String

fol = GetMyPath
sFol = Dir(fol & "*レポート*", vbDirectory)
If sFol = "" Then
 sFol = "Excelレポート"
 MkDir fol & sFol
End If
fol = fol & sFol & "\"

CSVname = Left$(CSVname, Len(CSVname) - 4)
wbn = "【レポート】" & CSVname & ".xlsx"

awb.SaveAs fol & wbn, FileFormat:=xlOpenXMLWorkbook

End Sub
