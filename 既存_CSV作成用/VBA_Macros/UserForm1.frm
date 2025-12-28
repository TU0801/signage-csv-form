Attribute VB_Name = "UserForm1"
Attribute VB_Base = "0{9BC9E3FF-B7EC-4C15-BC12-F5BCF2D3C439}{A76344D9-8429-4DC0-B02B-0AEB57F1769E}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
Option Explicit

Private Sub ComboBox1_Change()

With Me.ComboBox1
 If .Value = "" And .ListCount > 0 Then
  .Value = .List(0)
 End If
End With
Call 入力候補リスト更新

End Sub

Private Sub ComboBox2_Change()

Call 受注先入力

End Sub

Private Sub ComboBox3_Change()

Call 案内文カテゴリ選択

End Sub

Private Sub ComboBox4_Change()

Call 案内文選択

End Sub

Private Sub ComboBox5_Change()

Call 入力候補リスト更新

End Sub

Private Sub CommandButton2_Click()

Call フォームサイズ変更

End Sub

Private Sub CommandButton3_Click()

Call 入力の編集内容記録

End Sub

Private Sub CommandButton4_Click()

Call 貼紙サンプル表示

End Sub

Private Sub CommandButton5_Click()

Call サンプルイメージ削除

End Sub

Private Sub CommandButton6_Click()

Call 入力の編集内容記録(True)

End Sub

Private Sub CommandButton7_Click()


If Me.Label32.ForeColor = RGB(255, 255, 255) Then
 Me.Label32.ForeColor = RGB(0, 0, 0)
Else
 Me.Label32.ForeColor = RGB(255, 255, 255)
End If


End Sub

Private Sub ListBox1_Click()

Call 候補リスト選択

End Sub

Private Sub OptionButton1_Click()

Call 入力候補リスト更新

End Sub

Private Sub OptionButton2_Click()

Call 入力候補リスト更新

End Sub

Private Sub OptionButton3_Click()

Call 入力候補リスト更新

End Sub

Private Sub OptionButton4_Click()

Call 貼紙表示位置

End Sub

Private Sub OptionButton5_Click()

Call 貼紙表示位置

End Sub

Private Sub OptionButton6_Click()

Call 貼紙表示位置

End Sub

Private Sub OptionButton7_Click()

Call 貼紙表示位置

End Sub

Private Sub OptionButton8_Click()

Call 貼紙表示位置

End Sub

Private Sub OptionButton9_Change()

If Me.OptionButton9.Value = True Then
 Call 貼紙サンプル表示
End If

End Sub

Private Sub SpinButton1_SpinDown()

Dim n As Long

n = Me.TextBox25.Value
If n > 1 Then
 Me.TextBox25.Value = n - 1
End If

End Sub

Private Sub SpinButton1_SpinUp()

Dim n As Long
Dim Lim As Long

Lim = Me.Label50.Caption
n = Me.TextBox25.Value
If n < Lim Then
 Me.TextBox25.Value = n + 1
End If

End Sub

Private Sub TextBox1_Change()

InputNum Me.TextBox1
Call 物件コード入力
Call 入力候補リスト更新

End Sub

Private Sub TextBox1_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox1, Button

End Sub

Private Sub TextBox10_Change()

InputNum Me.TextBox10
Call 点検期間入力

End Sub

Private Sub TextBox10_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox10, Button

End Sub

Private Sub TextBox11_Change()

Dim Str As String

If Me.掲示備考サンプル = False Then
 Call 掲示備考入力
 Str = Me.TextBox11.Value
Else
 Str = ""
End If
Me.Label33.Caption = Str

End Sub

Private Sub TextBox11_Enter()

If Me.掲示備考サンプル.Value = True Then
 Call 掲示備考入力待機
End If

End Sub

Private Sub TextBox11_Exit(ByVal Cancel As MSForms.ReturnBoolean)

If Me.TextBox11.Value = "" Then
 Call 掲示備考サンプル表示
End If

End Sub

Private Sub TextBox12_Change()

InputNum Me.TextBox12

End Sub

Private Sub TextBox12_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox12, Button

End Sub

Private Sub TextBox13_Change()

InputNum Me.TextBox13

End Sub

Private Sub TextBox13_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox13, Button

End Sub

Private Sub TextBox14_Change()

InputNum Me.TextBox14

End Sub

Private Sub TextBox14_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox14, Button

End Sub

Private Sub TextBox15_Change()

InputNum Me.TextBox15

End Sub

Private Sub TextBox15_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox15, Button

End Sub

Private Sub TextBox16_Change()

InputNum Me.TextBox16

End Sub

Private Sub TextBox16_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox16, Button

End Sub

Private Sub TextBox17_Change()

InputNum Me.TextBox17

End Sub

Private Sub TextBox17_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox17, Button

End Sub

Private Sub TextBox18_Change()

InputNum Me.TextBox18

End Sub

Private Sub TextBox18_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox18, Button

End Sub

Private Sub TextBox19_Change()

InputNum Me.TextBox19

End Sub

Private Sub TextBox19_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox19, Button

End Sub

Private Sub TextBox20_Change()

InputNum Me.TextBox20

End Sub

Private Sub TextBox20_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox20, Button

End Sub

Private Sub TextBox21_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox21, Button

End Sub

Private Sub TextBox22_Change()

Dim Str As String

 Str = Me.TextBox22.Value

Me.Label31.Caption = Str

End Sub

Private Sub TextBox25_Change()

InputNum Me.TextBox25
If Me.TextBox25.Value = "" Then Me.TextBox25.Value = "6"

End Sub

Private Sub TextBox25_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox25, Button

End Sub

Private Sub TextBox4_Change()

InputABC Me.TextBox4, 許可する文字列:="- "

End Sub

Private Sub TextBox5_Change()

InputNum Me.TextBox5
Call 点検期間入力

End Sub

Private Sub TextBox5_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox5, Button

End Sub

Private Sub TextBox6_Change()

InputNum Me.TextBox6
Call 点検期間入力

End Sub

Private Sub TextBox6_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox6, Button

End Sub

Private Sub TextBox7_Change()

InputNum Me.TextBox7
Call 点検期間入力

End Sub

Private Sub TextBox7_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox7, Button

End Sub

Private Sub TextBox8_Change()

InputNum Me.TextBox8
Call 点検期間入力

End Sub

Private Sub TextBox8_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox8, Button

End Sub

Private Sub TextBox9_Change()

InputNum Me.TextBox9
Call 点検期間入力

End Sub

Private Sub TextBox9_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox9, Button

End Sub

Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)

If CloseMode = 0 Then
 If MsgBox("このフォームを閉じても良いですか？" & vbLf & "※編集中のデータは破棄されます※", vbQuestion Or vbYesNo Or vbSystemModal) = vbYes Then
  Call 履歴を記録
  Unload Me
 Else
  Cancel = True
 End If
End If

End Sub

