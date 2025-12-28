Attribute VB_Name = "○入力_98_フォームサイズ変更"
Option Explicit

Sub フォームサイズ変更()

Const MinH As Single = 64
Const MinW As Single = 390
Const MinL As Single = 12
Dim MaxH As Single
Dim MaxW As Single
Dim MaxL As Single
Dim MvLeft As Single

With UserForm1
 MaxW = .Label36.Caption
 MaxH = .Label37.Caption
 MaxL = .Label38.Caption
 If .Width < MaxW Then
  '大きくする
  .Width = MaxW
  .Height = MaxH
  .Frame5.Left = MaxL
  .MultiPage1.Visible = True
  .Frame7.Visible = True
  MvLeft = MinW - MaxW
  .CommandButton2.Caption = "フォームを最小化"
 Else
  '小さくする
  .Width = MinW
  .Height = MinH
  .Frame5.Left = MinL
  .MultiPage1.Visible = False
  .Frame7.Visible = False
  MvLeft = MaxW - MinW
  .CommandButton2.Caption = "元に戻す"
 End If
 .Left = .Left + MvLeft
End With

End Sub
