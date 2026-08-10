unit RegionsTest;

interface

{$IFDEF UNICODE}
uses
  System.SysUtils, System.Classes, System.Generics.Collections;
{$ELSE}
uses
  SysUtils, Classes;
{$ENDIF}

{$IFNDEF CONSOLE}
type
  TConsoleHelper = class
    procedure Write(const AMsg: string);
  end;
{$ENDIF}

{$IF Defined(MSWINDOWS) and (CompilerVersion >= 36)}
type
  TWinHelper = class
    class function GetVersion: string;
  end;
{$IFEND}

{$REGION 'Public Types'}
type
  IDataProvider = interface(IInterface)
    ['{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}']
    function GetById(const AId: Integer): string;
    procedure Save(const AId: Integer; const AValue: string);
  end;

  TDataItem = record
    Id: Integer;
    Name: string;
    Value: Double;
    class operator Equal(const A, B: TDataItem): Boolean;
  end;

  TDataProvider = class(TInterfacedObject, IDataProvider)
  private
    FItems: TDictionary<Integer, string>;
    function GetById(const AId: Integer): string;
    procedure Save(const AId: Integer; const AValue: string);
  public
    constructor Create;
    destructor Destroy; override;
  end;

  TMainController = class(TObject)
  private
{$REGION 'Private Fields'}
    FProvider: IDataProvider;
    FActive: Boolean;
    FOnChanged: TNotifyEvent;
    FConfig: TDictionary<string, Variant>;
{$ENDREGION}
{$REGION 'Private Methods'}
    procedure DoActivate;
    procedure DoDeactivate;
    procedure NotifyChange;
{$ENDREGION}
  public
    constructor Create(const AProvider: IDataProvider);
    destructor Destroy; override;
    procedure Activate;
    procedure Deactivate;
    function IsActive: Boolean;
    property OnChanged: TNotifyEvent read FOnChanged write FOnChanged;
  end;
{$ENDREGION}

{$REGION 'Type Aliases'}
type
  TDataItems = TArray<TDataItem>;
  TCallback = reference to procedure(const AItem: TDataItem);
  TFilterFunc = reference to function(const AItem: TDataItem): Boolean;
{$ENDREGION}

{$REGION 'Constants & Resource Strings'}
const
  cDefaultCacheSize = 256;
  cMaxRetries = 3;
  cAppVersion: array[0..3] of Integer = (2, 5, 0, 123);

resourcestring
  rsErrorLoading = 'Fehler beim Laden der Daten';
  rsNotFound = 'Element nicht gefunden: %s';
  rsSavedOk = 'Gespeichert';
{$ENDREGION}

{$REGION 'Public API'}
function CreateController: TMainController;
procedure InitializeDatabase(const APath: string);
procedure ShutdownDatabase;
{$ENDREGION}

implementation

uses
  System.IOUtils, System.StrUtils;

var
  _GlobalDbPath: string;
  _GlobalInitialized: Boolean;

{$REGION 'Private Implementation Types'}
type
  TDatabaseConnection = class(TObject)
  private
    FPath: string;
    FConnected: Boolean;
  public
    constructor Create(const APath: string);
    procedure Connect;
    procedure Disconnect;
    function Execute(const ASQL: string): Integer;
  end;

  TTransactionScope = record
  private
    FConnection: TDatabaseConnection;
    FActive: Boolean;
  public
    class operator Initialize(out ADest: TTransactionScope);
    class operator Finalize(var ADest: TTransactionScope);
  end;
{$ENDREGION}

{$REGION 'Database Layer'}

{$REGION 'Connection Management'}
constructor TDatabaseConnection.Create(const APath: string);
begin
  FPath := APath;
  FConnected := False;
end;

procedure TDatabaseConnection.Connect;
begin
  if not FConnected then
  begin
    {$IFDEF MSWINDOWS}
    FConnected := FileExists(FPath);
    {$ELSE}
    FConnected := TFile.Exists(FPath);
    {$ENDIF}
  end;
end;

procedure TDatabaseConnection.Disconnect;
begin
  FConnected := False;
end;

function TDatabaseConnection.Execute(const ASQL: string): Integer;
begin
  Connect;
  {$IFDEF DEBUG}
  WriteLn('SQL: ', ASQL);
  {$ENDIF}
  Result := 0;
end;
{$ENDREGION}

{$REGION 'Transaction Support'}
class operator TTransactionScope.Initialize(out ADest: TTransactionScope);
begin
  ADest.FConnection := nil;
  ADest.FActive := False;
end;

class operator TTransactionScope.Finalize(var ADest: TTransactionScope);
begin
  ADest.FActive := False;
end;
{$ENDREGION}

{$ENDREGION}

{$REGION 'IDataProvider Implementation'}

{$REGION 'TDataProvider'}
constructor TDataProvider.Create;
begin
  inherited Create;
  FItems := TDictionary<Integer, string>.Create;
end;

destructor TDataProvider.Destroy;
begin
  FItems.Free;
  inherited;
end;

function TDataProvider.GetById(const AId: Integer): string;
begin
  if not FItems.TryGetValue(AId, Result) then
    Result := '';
end;

procedure TDataProvider.Save(const AId: Integer; const AValue: string);
begin
  FItems.AddOrSetValue(AId, AValue);
end;
{$ENDREGION}

{$REGION 'TDataItem'}
class operator TDataItem.Equal(const A, B: TDataItem): Boolean;
begin
  Result := (A.Id = B.Id) and (A.Name = B.Name) and SameValue(A.Value, B.Value);
end;
{$ENDREGION}

{$ENDREGION}

{$REGION 'TMainController'}

constructor TMainController.Create(const AProvider: IDataProvider);
begin
  inherited Create;
  FProvider := AProvider;
  FActive := False;
  FConfig := TDictionary<string, Variant>.Create;
end;

destructor TMainController.Destroy;
begin
  FConfig.Free;
  inherited;
end;

{$REGION 'Private Helpers'}
procedure TMainController.DoActivate;
begin
  FActive := True;
  NotifyChange;
end;

procedure TMainController.DoDeactivate;
begin
  FActive := False;
  NotifyChange;
end;

procedure TMainController.NotifyChange;
begin
  if Assigned(FOnChanged) then
    FOnChanged(Self);
end;
{$ENDREGION}

{$REGION 'Public Interface'}
procedure TMainController.Activate;
begin
  if not FActive then
    DoActivate;
end;

procedure TMainController.Deactivate;
begin
  if FActive then
    DoDeactivate;
end;

function TMainController.IsActive: Boolean;
begin
  Result := FActive;
end;
{$ENDREGION}

{$ENDREGION}

{$REGION 'Global Functions'}

{$REGION 'Factory'}
function CreateController: TMainController;
var
  LProvider: IDataProvider;
begin
  LProvider := TDataProvider.Create;
  Result := TMainController.Create(LProvider);
end;
{$ENDREGION}

{$REGION 'Lifecycle'}
procedure InitializeDatabase(const APath: string);
var
  LConn: TDatabaseConnection;
begin
  _GlobalDbPath := APath;
  LConn := TDatabaseConnection.Create(APath);
  try
    LConn.Connect;
    LConn.Execute('PRAGMA journal_mode=WAL');
  finally
    LConn.Free;
  end;
  _GlobalInitialized := True;
end;

procedure ShutdownDatabase;
begin
  _GlobalInitialized := False;
  _GlobalDbPath := '';
end;
{$ENDREGION}

{$ENDREGION}

initialization
{$REGION 'Module Init'}
  _GlobalInitialized := False;
  _GlobalDbPath := '';
{$ENDREGION}

finalization
{$REGION 'Module Finalization'}
  ShutdownDatabase;
{$ENDREGION}

{$IFDEF LOGGING}
  LogManager.Shutdown;
{$ENDIF}

end.
