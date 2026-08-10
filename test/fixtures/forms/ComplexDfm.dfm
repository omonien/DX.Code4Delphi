inherited ComplexForm: TComplexForm[0]
  Left = 150
  Top = 80
  Width = 1024
  Height = 768
  AlphaBlend = True
  AlphaBlendValue = 220
  BorderStyle = bsSizeable
  Caption = 'DFM '#220'berblick & Test-'#228'Formular'
  ClientHeight = 640
  ClientWidth = 480
  Color = clBtnFace
  Constraints.MaxHeight = 1200
  Constraints.MaxWidth = 1600
  Constraints.MinHeight = 200
  Constraints.MinWidth = 300
  Cursor = crHandPoint
  Font.Charset = DEFAULT_CHARSET
  Font.Color = clWindowText
  Font.Height = -12
  Font.Name = 'Arial Bold'
  Font.Orientation = 0
  Font.Pitch = fpDefault
  Font.Size = 9
  Font.Style = [fsBold, fsItalic, fsUnderline]
  FormStyle = fsNormal
  GlassFrame.Enabled = False
  GlassFrame.SheetOfGlass = True
  KeyPreview = True
  OldCreateOrder = True
  PixelsPerInch = 96
  PopupMenu = PopupMenu1
  Position = poDesktopCenter
  PrintScale = poPrintToFit
  ShowHint = True
  SnapBuffer = 10
  Tag = $FF
  WindowState = wsNormal
// Haupt-Panel – linker Bereich
  object LeftPanel: TPanel
    Left = 0
    Top = 0
    Width = 250
    Height = 640
    Align = alLeft
    BevelInner = bvRaised
    BevelOuter = bvLowered
    BevelWidth = 2
    BiDiMode = bdLeftToRight
    BorderWidth = 3
    Caption = 'Option'#39'en & '#220'sicht' // Caption: Optionen & Übersicht
    Color = $00F0F0F0
    Ctl3D = True
    DoubleBuffered = True
    DragCursor = crDrag
    DragKind = dkDrag
    DragMode = dmAutomatic
    Enabled = True
    Font.Color = clNavy
    Font.Height = -11
    Font.Name = 'Segoe UI'
    Font.Style = [fsBold]
    FullRepaint = False
    Locked = False
    Padding.Bottom = 5
    Padding.Left = 8
    Padding.Right = 8
    Padding.Top = 5
    ParentBiDiMode = False
    ParentColor = False
    ParentCtl3D = False
    ParentDoubleBuffered = False
    ParentFont = False
    ParentShowHint = False
    ShowHint = True
    TabOrder = 0
    TabStop = True
    Touch.ParentTabletOptions = False
    Touch.TabletOptions = [toPressHold, toSmoothScrolling]
    UseDockManager = True
    Visible = True
    // geschachteltes Such-Panel mit Edit und Button
    object SearchGroup: TGroupBox
      Left = 8
      Top = 8
      Width = 234
      Height = 105
      Align = alTop
      Caption = 'Such'#39'maske'
      Color = clBtnFace
      ParentColor = False
      TabOrder = 0
      object SearchLabel: TLabel
        Left = 16
        Top = 24
        Width = 50
        Height = 13
        Caption = 'Such'#39'begriff'
        FocusControl = SearchEdit
      end
      object SearchEdit: TEdit
        Left = 16
        Top = 40
        Width = 145
        Height = 21
        Anchors = [akLeft, akTop, akRight]
        AutoSelect = True
        AutoSize = False
        CharCase = ecLowerCase
        Ctl3D = True
        MaxLength = 255
        ParentCtl3D = False
        PasswordChar = #$25CF
        ReadOnly = False
        TabOrder = 0
        Text = ''
        TextHint = 'Bitte Begriff eingeben'
      end
      object SearchBtn: TButton
        Left = 168
        Top = 38
        Width = 55
        Height = 25
        Action = SearchAction
        Anchors = [akTop, akRight]
        Cancel = False
        Default = True
        DoubleBuffered = True
        Enabled = True
        ImageAlignment = iaCenter
        ImageIndex = 0
        Images = ImageList1
        ModalResult = mrNone
        ParentDoubleBuffered = False
        Style = bsSplitButton
        TabOrder = 1
        WordWrap = True
      end
    end
    // TreeView mit verschachtelten Items
    object TreeView1: TTreeView
      Left = 8
      Top = 120
      Width = 234
      Height = 512
      Anchors = [akLeft, akTop, akRight, akBottom]
      AutoExpand = True
      BiDiMode = bdLeftToRight
      BorderStyle = bsSingle
      Color = clWindow
      Ctl3D = True
      DoubleBuffered = True
      DragMode = dmAutomatic
      Font.Name = 'Consolas'
      Font.Size = 10
      Font.Style = []
      HideSelection = False
      HotTrack = True
      Indent = 19
      MultiSelect = True
      MultiSelectStyle = [msControlSelect, msShiftSelect, msVisibleOnly, msSiblingOnly]
      ParentBiDiMode = False
      ParentColor = False
      ParentCtl3D = False
      ParentDoubleBuffered = False
      ParentFont = False
      ParentShowHint = False
      ReadOnly = True
      RightClickSelect = True
      RowSelect = True
      ShowButtons = True
      ShowHint = True
      ShowLines = True
      ShowRoot = True
      SortType = stBoth
      StateImages = StateImageList
      TabOrder = 1
      TabStop = True
      ToolTips = True
      Touch.Expandable = True
      Items.NodeData = {
        020000000100000000000000FFFFFFFFFFFFFFFF0000000000000000000000
        0941006B007400200031000200000000000000FFFFFFFFFFFFFFFF00000000
        00000000000000000941006B007400200032000400000000000000FFFFFFFF
        FFFFFFFF0000000000000000000000000A55006E007400650072006C006900
        7300740065000100000000000000FFFFFFFFFFFFFFFF000000000000000000
        0000000A55006E007400650072006C006900730074006500}
      // Kommentar: TreeView Items sind als Binärdaten gespeichert
    end
  end
// Mittlerer Bereich – Multi-Splitter
  object Splitter1: TSplitter
    Left = 250
    Top = 0
    Width = 5
    Height = 640
    Align = alLeft
    AutoSnap = True
    Beveled = False
    MinSize = 100
    ResizeStyle = rsUpdate
  end
  object CenterPanel: TPanel
    Left = 255
    Top = 0
    Width = 225
    Height = 640
    Align = alClient
    BevelOuter = bvNone
    BorderStyle = bsSingle
    Caption = ''
    Color = clWhite
    Font.Charset = DEFAULT_CHARSET
    Font.Color = clBlack
    Font.Height = -11
    Font.Name = 'Tahoma'
    Font.Style = []
    ParentBackground = False
    ParentColor = False
    ParentFont = False
    ShowCaption = False
    TabOrder = 2
// übernommene Komponente
inherited OkButton: TButton[0]
      Left = 80
      Top = 600
      Width = 75
      Height = 25
      Anchors = [akRight, akBottom]
      Cancel = True
      Caption = '&'#220'bernehmen'
      Default = False
      ModalResult = mrOk
      TabOrder = 0
    end
(* Block-Kommentar: Eingebettetes Frame *)
    inline DetailsFrame: TDetailsFrame[1]
      Left = 0
      Top = 0
      Width = 221
      Height = 590
      Align = alClient
    end
// Tief verschachtelte Komponenten im mittleren Panel
    object DetailGroup: TGroupBox
      Left = 10
      Top = 10
      Width = 200
      Height = 580
      Caption = 'Detail'#39'informationen'
      TabOrder = 0
      object Notebook: TPageControl
        Left = 8
        Top = 20
        Width = 184
        Height = 550
        ActivePage = TabGeneral
        Align = alClient
        MultiLine = False
        RaggedRight = False
        ScrollOpposite = False
        Style = tsTabs
        TabHeight = 22
        TabOrder = 0
        TabPosition = tpTop
        TabWidth = 90
        Touch.ParentTabletOptions = False
        Touch.TabletOptions = [toPressAndHold]
        object TabGeneral: TTabSheet
          Caption = 'Allgemein'
          ExplicitLeft = 8
          ExplicitTop = 47
          object MainGrid: TStringGrid
            Left = 0
            Top = 0
            Width = 176
            Height = 520
            Align = alClient
            BevelInner = bvNone
            BevelOuter = bvNone
            BiDiMode = bdLeftToRight
            BorderStyle = bsNone
            ColCount = 2
            Ctl3D = True
            DefaultColWidth = 80
            DefaultDrawing = True
            DefaultRowHeight = 21
            DoubleBuffered = True
            DrawingStyle = gdsGradient
            Enabled = True
            FixedColor = clBtnFace
            FixedCols = 0
            FixedRows = 1
            GradientEndColor = $00E0E0E0
            GradientStartColor = clWhite
            GridLineWidth = 1
            Options = [goFixedVertLine, goFixedHorzLine, goVertLine,
              goHorzLine, goRangeSelect, goDrawFocusSelected,
              goRowSizing, goColSizing, goRowMoving, goColMoving,
              goEditing, goTabs, goRowSelect,
              goAlwaysShowEditor, goThumbTracking]
            ParentBiDiMode = False
            ParentColor = False
            ParentCtl3D = False
            ParentDoubleBuffered = False
            ParentFont = False
            ParentShowHint = False
            RowCount = 20
            ScrollBars = ssBoth
            ShowHint = True
            TabOrder = 0
            Touch.InteractiveGestures = [igPan, igPressAndTap,
              igLongTap, igDoubleTap]
            Touch.ParentInteractiveGestures = False
          end
        end
        object TabAdvanced: TTabSheet
          Caption = 'Erweitert'
          object DescMemo: TMemo
            Left = 0
            Top = 0
            Width = 176
            Height = 260
            Align = alTop
            Alignment = taLeftJustify
            BevelKind = bkFlat
            BevelOuter = bvRaised
            BiDiMode = bdLeftToRight
            BorderStyle = bsSingle
            CharCase = ecNormal
            Color = clInfoBk
            Ctl3D = True
            Font.Name = 'Consolas'
            Font.Size = 9
            Font.Style = []
            HideSelection = False
            Lines.Strings = (
              'Zeile 1: Ansichtstyp '#228'ndern'
              'Zeile 2: Filter '#220'bernahme pr'#252'fen'
              'Zeile 3: Umlaute testen: '#196#214#220#228#246#252#223)
            MaxLength = 1024
            ParentBiDiMode = False
            ParentColor = False
            ParentCtl3D = False
            ParentFont = False
            ParentShowHint = False
            ReadOnly = False
            ScrollBars = ssBoth
            ShowHint = False
            TabOrder = 0
            WantReturns = True
            WantTabs = False
            WordWrap = True
          end
        end
        object TabData: TTabSheet
          Caption = 'Daten'
          object DataList: TCheckListBox
            Left = 0
            Top = 0
            Width = 176
            Height = 520
            Align = alClient
            BevelInner = bvSpace
            BevelKind = bkTile
            BevelOuter = bvRaised
            Color = clWindow
            Columns = 0
            Ctl3D = True
            DoubleBuffered = True
            ExtendedSelect = True
            Font.Name = 'Tahoma'
            Font.Size = 8
            Font.Style = []
            HeaderBackgroundColor = clBtnFace
            HeaderColor = clWindowText
            IntegralHeight = True
            ItemHeight = 16
            Items.Strings = (
              'Eintrag A'
              'Eintrag B'
              'Eintrag C')
            MultiSelect = True
            ParentColor = False
            ParentCtl3D = False
            ParentDoubleBuffered = False
            ParentFont = False
            ParentShowHint = False
            ShowHint = True
            Sorted = False
            Style = lbOwnerDrawFixed
            TabOrder = 0
            TabWidth = 32
          end
        end
      end
    end
  end
// Collection im Object Inspector Style
  object ActionList1: TActionList
    Left = 500
    Top = 16
    object SearchAction: TAction
      Category = 'Suche'
      Caption = '&Suchen'
      Hint = 'Suche starten|Startet die Volltextsuche '#252'ber alle Datens'#228'tze'
      ImageIndex = 0
      ShortCut = 16454 // Strg+F
      SecondaryShortCuts.Strings = (
        'F3')
    end
    object FilterAction: TAction
      Category = 'Filter'
      Caption = 'Fil&tern'
      Checked = False
      Enabled = False
      GroupIndex = 1
      HelpContext = 1001
      HelpKeyword = 'filter_help'
      HelpType = htKeyword
      Hint = 'Filter anwenden'
      ImageIndex = 2
      ShortCut = 16455 // Strg+G
      Visible = False
    end
  end
  object ImageList1: TImageList
    Left = 560
    Top = 16
    ColorDepth = cd32Bit
    DrawingStyle = dsTransparent
    Height = 16
    Width = 16
    BlendColor = clNone
    BkColor = clNone
    Masked = True
    Bitmap = {
      49492A000000200020000000E0E0E000FF0000000000000000000000000000
      00000000000000000000000000000000000000000000000000000000000000}
  end
  object PopupMenu1: TPopupMenu
    Left = 620
    Top = 16
    OnPopup = PopupMenu1Popup
    object MenuOpen: TMenuItem
      Caption = #214'&ffnen...'
      Default = True
      Enabled = True
      GroupIndex = 0
      Hint = 'Datei '#246'ffnen'
      ImageIndex = 3
      RadioItem = False
      ShortCut = 16463
      object MenuRecent: TMenuItem
        Caption = 'Zuletzt ge'#246'ffnet'
        Enabled = True
        GroupIndex = 1
        Hint = 'Zuletzt '#13#10'ge'#246'ffnete '#13#10'Dateien'
        Visible = True
      end
    end
    object MenuSave: TMenuItem
      Caption = '&Speichern'
      Enabled = True
      ImageIndex = 4
      ShortCut = 16467
    end
    object Divider1: TMenuItem
      Caption = '-'
    end
    object MenuExit: TMenuItem
      Caption = 'Be&enden'
      Enabled = True
      ShortCut = 32883
    end
  end
// Component ohne Typangabe
  object HelperLabel
    Left = 680
    Top = 560
    Width = 200
    Height = 40
    Caption = 'Hilfesystem '#9829' Unicode'
    Font.Color = clGray
    Font.Size = 12
    Font.Style = [fsBold, fsItalic, fsUnderline, fsStrikeOut]
    WordWrap = True
  end
// Zeitgeber – unsichtbare Komponente
  object AutoTimer: TTimer
    Enabled = True
    Interval = 500
    OnTimer = TimerTick
    Tag = 42
  end
// Datasource – unsichtbare Komponente
  object DataSource1: TDataSource
    AutoEdit = True
    DataSet = nil
    Enabled = True
  end
// REST-Client (unsichtbar)
  object RESTClient: TRESTClient
    Accept = 'application/json, text/plain; q=0.9, */*; q=0.5'
    AcceptCharset = 'utf-8, iso-8859-1;q=0.5'
    AcceptEncoding = 'gzip, deflate, br'
    BaseURL = 'https://api.example.com/v2'
    ContentType = 'application/json'
    Params = <
      item
        Name = 'apikey'
        Value = 'abc123def456'
      end
      item
        Name = 'lang'
        Value = 'de-DE'
      end
      item
        Name = 'limit'
        Value = '50'
      end>
    FallbackCharsetEncoding = 'raw'
    HandleRedirects = True
    SynchronizedEvents = True
    UserAgent = 'MyDelphiApp/2.5'
  end
end
