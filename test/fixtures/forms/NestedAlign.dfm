object Form1: TForm1
  Left = 0
  Top = 0
  ClientHeight = 200
  ClientWidth = 300
  object Outer: TPanel
    Left = 0
    Top = 0
    Width = 300
    Height = 200
    Align = alClient
    object Header: TPanel
      Left = 0
      Top = 0
      Width = 300
      Height = 25
      Align = alTop
    end
    object Body: TPanel
      Left = 0
      Top = 25
      Width = 300
      Height = 175
      Align = alClient
    end
  end
end
