Attribute VB_Name = "☆PNGからJPG"
Option Explicit

Sub ChgToJpg(ByRef 写真保存場所 As String, ByRef 写真パス As String)

Dim ScrUpd As Boolean
Dim i As Long
Dim fol As String, imgName As String
Dim TGT As String, fPath As String, fName As String, NewName As String, Exprt As Long
Dim aws As Worksheet


TGT = 写真保存場所 & 写真パス
If Dir(TGT) = "" Or TGT Like "*.jp*g" Then Exit Sub


fol = GetMyPath & "一時画像保存"
If Dir(fol, vbDirectory) = "" Then MkDir fol
fol = fol & "\"


i = InStrRev(TGT, "\")
imgName = Right$(TGT, Len(TGT) - i)
i = InStrRev(imgName, ".")
imgName = Left$(imgName, i - 1)

With Application
 ScrUpd = .ScreenUpdating
 .ScreenUpdating = False
 .EnableEvents = False
 .DisplayAlerts = False
End With

Set aws = ThisWorkbook.Worksheets.Add
aws.Activate
aws.Pictures.Insert(TGT).Select

fPath = Left(TGT, InStrRev(TGT, "\"))
fName = Replace(TGT, fPath, "")
fName = Left(fName, InStrRev(fName, ".") - 1)
Selection.Name = fName

写真保存場所 = fol
NewName = Format(Date, "mmdd") & " " & Format(Now, "hhmmss") & imgName & ".jpg"
写真パス = NewName

Exprt = Export2Jpg(aws, fol & NewName)

aws.Shapes(fName).Delete
aws.Delete

With Application
 .DisplayAlerts = True
 .EnableEvents = ScrUpd
 .ScreenUpdating = ScrUpd
End With

End Sub

Private Function Export2Jpg(ByVal aws As Worksheet, FF As String, Optional ByVal Obj As Object) As Long

If Obj Is Nothing Then Set Obj = Selection
Obj.CopyPicture xlScreen, xlBitmap

With aws.ChartObjects.Add(Obj.Left, Obj.Top, Obj.Width, Obj.Height).Chart
 .Parent.Select
 .Paste
 Application.CutCopyMode = False
 .Export FF
 .Parent.Delete
End With

End Function



