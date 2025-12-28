Attribute VB_Name = "UserForm2"
Attribute VB_Base = "0{AA979C9F-41B8-4E5C-9B4B-942E1C69B24D}{95764907-0045-4DA8-B5AE-5ACE19128EB2}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = False
Option Explicit

Private Sub CheckBox1_Click()

Dim Opt As Boolean
Dim i As Long

Opt = Me.CheckBox1.Value

With Me.ListBox1
 For i = 1 To .ListCount - 1
  .Selected(i) = Opt
 Next i
End With

End Sub

Private Sub ComboBox1_Change()

Call CSV出力の候補リスト更新

End Sub

Private Sub ComboBox2_Change()

'InputABC Me.ComboBox2, True
Call CSV出力の候補リスト更新

End Sub

Private Sub ComboBox2_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.ComboBox2, Button

End Sub

Private Sub CommandButton1_Click()

Call CSV出力処理

End Sub

Private Sub TextBox1_Change()

InputNum Me.TextBox1
Call CSV出力物件検索
Call CSV出力の候補リスト更新

End Sub

Private Sub TextBox1_MouseUp(ByVal Button As Integer, ByVal Shift As Integer, ByVal X As Single, ByVal Y As Single)

SlctTxtBox Me.TextBox1, Button

End Sub

Private Sub TextBox4_Change()

Call CSV出力の候補リスト更新

End Sub

