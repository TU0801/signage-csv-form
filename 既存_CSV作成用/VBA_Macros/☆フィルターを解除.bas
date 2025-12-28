Attribute VB_Name = "☆フィルターを解除"
Option Explicit

Public Sub フィルターを解除(Optional ByVal ws As Worksheet)

Dim n As Long
If ws Is Nothing Then Set ws = ActiveSheet

If ws.AutoFilterMode = True Then
 If ws.AutoFilter.FilterMode = True Then
  For n = 1 To ws.AutoFilter.Filters.Count
   If ws.AutoFilter.Filters(n).On Then
    ws.UsedRange.AutoFilter field:=n
    If ws.AutoFilter.FilterMode = False Then Exit For
   End If
  Next n
 End If
End If

End Sub

