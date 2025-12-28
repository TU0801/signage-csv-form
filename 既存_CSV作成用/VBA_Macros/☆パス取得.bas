Attribute VB_Name = "☆パス取得"
Option Explicit

Function GetMyPath() As String


    'URL以外（httpで始まらない）ならそのまま返す。
    Dim sPath As String
    sPath = ThisWorkbook.Path
    
    If Not sPath Like "http*" Then
        GetMyPath = sPath & "\"
        Exit Function
    End If
  
    '環境変数からOneDriveのフォルダを取得
    Dim OneD As String: OneD = Environ("OneDrive")
    
    
'　　If Environ("OneDriveConsumer") <> "" Then OneD = Environ("OneDriveConsumer")
'　　If Environ("OneDriveCommercial") <> "" Then OneD = Environ("OneDriveCommercial")
  
    'URL「https://d.docs.live.net/xxxxxxxxxxxxxxxx/○○○」
    '4番目の"/"以降（上記なら○○○の部分）を取り出す。
    '最初の3つの"/"を別文字にReplaceしてから、InStrで"/"の位置を求めています。
    
    
    Dim sTemp As String
    sTemp = Replace(sPath, "/", "_", , 3)
    GetMyPath = OneD & "\" & Mid(sTemp, InStr(sTemp, "/") + 1) & "\"

    GetMyPath = Replace(GetMyPath, "/", "\")
    
End Function
