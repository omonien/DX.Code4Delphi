object Form1: TForm1
  Left = 0
  Top = 0
  Caption = 'Form1'
  ClientHeight = 300
  ClientWidth = 400
  Color = clBtnFace
  Font.Charset = DEFAULT_CHARSET
  Font.Color = clWindowText
  Font.Height = -11
  Font.Name = 'Tahoma'
  Font.Style = []
  OldCreateOrder = False
  PixelsPerInch = 96
  TextHeight = 13
  object PanelTop: TPanel
    Left = 0
    Top = 0
    Width = 400
    Height = 40
    Align = alTop
    Caption = 'Top'
    TabOrder = 0
  end
  object PanelBottom: TPanel
    Left = 0
    Top = 270
    Width = 400
    Height = 30
    Align = alBottom
    Caption = 'Bottom'
    TabOrder = 1
  end
  object PanelLeft: TPanel
    Left = 0
    Top = 40
    Width = 80
    Height = 230
    Align = alLeft
    Caption = 'Left'
    TabOrder = 2
  end
  object PanelClient: TPanel
    Left = 80
    Top = 40
    Width = 320
    Height = 230
    Align = alClient
    Caption = 'Client'
    TabOrder = 3
    object Button1: TButton
      Left = 20
      Top = 20
      Width = 75
      Height = 25
      Caption = 'Button1'
      TabOrder = 0
    end
  end
end
