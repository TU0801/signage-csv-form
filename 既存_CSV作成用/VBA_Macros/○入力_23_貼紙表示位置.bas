Attribute VB_Name = "○入力_23_貼紙表示位置"
Option Explicit

Sub 貼紙表示位置()

Dim fName As String

With UserForm1
 fName = .Label30.Caption
 .Frame6.Picture = LoadPicture("")
 .Label43.Picture = LoadPicture("")
 .Label44.Picture = LoadPicture("")
 .Label45.Picture = LoadPicture("")
 .Label46.Picture = LoadPicture("")
 
 .Label43.Visible = False
 .Label44.Visible = False
 .Label45.Visible = False
 .Label46.Visible = False
 
 If Dir(fName) <> "" Then
  If .OptionButton4.Value = True Then
   DspPicture .Label43, fName
  ElseIf .OptionButton5.Value = True Then
   DspPicture .Label44, fName
  ElseIf .OptionButton6.Value = True Then
   DspPicture .Label45, fName
  ElseIf .OptionButton7.Value = True Then
   DspPicture .Label46, fName
  ElseIf .OptionButton8.Value = True Then
   .Frame6.Picture = LoadPicture(fName)
  End If
 End If
End With

End Sub

Private Sub DspPicture(ByVal Lbl As Control, ByVal fName As String)

Lbl.Picture = LoadPicture(fName)
Lbl.Visible = True


End Sub
