Attribute VB_Name = "○入力_22_貼紙サンプル表示"
Option Explicit

Sub 貼紙サンプル表示()
If UserForm1.Visible = False Then Exit Sub

Dim fName As String, fol As String
Dim Dflt As String, mStr As String

Dflt = GetMyPath
If UserForm1.OptionButton9.Value = True Then
 Call テンプレート検索(Dflt, fol, fName, mStr)
Else
 Call 追加分を選択(Dflt, fol, fName)
 mStr = ""
End If

If mStr <> "" Then
' MsgBox mStr, vbExclamation Or vbSystemModal
 fName = ""
End If

If fName = "" Then
 fName = GetNoImage(Dflt)
 fol = ""
 UserForm1.Label29.Caption = "-"
 UserForm1.Label30.Caption = ""
Else
 ChgToJpg fol, fName
 UserForm1.Label29.Caption = fName
 UserForm1.Label30.Caption = fol & fName
End If

UserForm1.Frame3.Picture = LoadPicture(fol & fName)
Call 貼紙表示位置

End Sub

Private Sub テンプレート検索(ByVal Dflt As String, ByRef fol As String, ByRef fName As String, ByRef mStr As String)

Dim sFol As String
Dim Check As String

mStr = ""
sFol = Dir(Dflt & "*貼紙*テンプレート*", vbDirectory)
If sFol <> "" Then
 Check = UserForm1.TextBox24.Value
 If Check <> "" Then
  fol = Dflt & sFol & "\"
  fName = Dir(fol & "*" & Check & "*.jp*g")
  If fName = "" Then
   fName = Dir(fol & "*" & Check & "*.png")
   If fName <> "" Then
    ChgToJpg fol, fName
   End If
  End If
  
  
  If fName <> "" Then
   fName = fName
  Else
   mStr = "※テンプレート（画像）が見つかりません"
  End If
 Else
  mStr = "※テンプレート（ファイル名）が設定されていません"
 End If
Else
 mStr = "※テンプレート保存用のフォルダが見つかりません"
End If


End Sub

Private Sub 追加分を選択(ByVal Dflt As String, ByRef fol As String, ByRef fName As String)

Dim i As Long
Dim Drv As String, sFol As String

sFol = Dir(Dflt & "*貼紙*追加", vbDirectory)
If sFol <> "" Then
 fol = Dflt & sFol
Else
 fol = Left$(Dflt, Len(Dflt) - 1)
End If

Drv = Left$(fol, 1)

ChDrive Drv
ChDir fol

fName = Application.GetOpenFilename("画像を選択,*.jpeg;*.jpg;*.png")
If fName = "False" Then
 fName = ""
 fol = ""
Else
 i = InStrRev(fName, "\")
 fol = Left$(fName, i)
 fName = Right$(fName, Len(fName) - i)
End If

End Sub

Private Function GetNoImage(ByVal Dflt As String) As String

Dim sFol As String, fol As String
Dim fName As String

fName = ""
sFol = Dir(Dflt & "*貼紙*追加*", vbDirectory)
If sFol <> "" Then
 fol = Dflt & sFol & "\"
 fName = Dir(fol & "*NOIMAGE*.jpg")
 If fName <> "" Then
  fName = fol & fName
 End If
End If

GetNoImage = fName

End Function
