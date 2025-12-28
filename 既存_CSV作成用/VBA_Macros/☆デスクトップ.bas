Attribute VB_Name = "☆デスクトップ"
Option Explicit

Function DskTop() As String

Dim WSH As Variant
Dim fol As String

Set WSH = CreateObject("Wscript.shell")
fol = WSH.SpecialFolders("DeskTop") & "\"

DskTop = fol

End Function

