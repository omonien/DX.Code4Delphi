unit MyUnit;

interface

uses
  System.SysUtils, System.Classes, System.Generics.Collections;

type
  TBase = class(TObject)
  public
    procedure BaseMethod(A: Integer); virtual; abstract;
  end;

  TMyClass = class(TBase)
  private
    FValue: Integer; // a field
    FItems: TList<Integer>;
    { a block comment }
    (* another comment style *)
    procedure DoWork(A: Integer; const B: string); virtual; abstract;
    function GetValue: Integer;
  public
    constructor Create;
    destructor Destroy; override;
    procedure DoWork(A: Integer; const B: string); overload;
    procedure DoWork(A: Double); overload;
    procedure DoWork(A: Integer; const B: string; const C: array of Byte); overload;
    class operator Add(A, B: TMyClass): TMyClass;
    class function CreateDefault: TMyClass; static;
    [ComponentName(1)]
    procedure Annotated;
    property Value: Integer read FValue write FValue;
    property Items: TList<Integer> read FItems;
  end;

  TMyGeneric<T> = class(TObject)
  public
    procedure AddItem(const Item: T);
    function GetItem(Index: Integer): T;
  end;

  TMyRecord = record
    X, Y: Integer;
    class operator Implicit(const A: Integer): TMyRecord;
    procedure Reset; inline;
  end;

  TMyHelper = class helper for TMyClass
    function HelperMethod: Boolean;
  end;

function GlobalHelper(A: Integer): string;

implementation

procedure TBase.BaseMethod(A: Integer);
begin
  // nothing
end;

constructor TMyClass.Create;
begin
  inherited Create;
  FValue := $FF + 42 + 3.14;
  FItems := TList<Integer>.Create;
end;

destructor TMyClass.Destroy;
begin
  FItems.Free;
  inherited Destroy;
end;

procedure TMyClass.DoWork(A: Integer; const B: string);
begin
  if FValue > 0 then
    WriteLn(Format('x %d', [FValue]))
  else
    WriteLn('nope');
  {$IFDEF DEBUG}
  WriteLn('debug' + #13#10 + 'mode');
  {$ENDIF}
end;

procedure TMyClass.DoWork(A: Double);
begin
  WriteLn('double overload');
end;

procedure TMyClass.DoWork(A: Integer; const B: string; const C: array of Byte);
begin
  WriteLn('three params');
end;

class operator TMyClass.Add(A, B: TMyClass): TMyClass;
begin
  Result := TMyClass.Create;
  Result.FValue := A.FValue + B.FValue;
end;

class function TMyClass.CreateDefault: TMyClass;
begin
  Result := TMyClass.Create;
end;

procedure TMyClass.Annotated;
begin
  // annotated method
end;

function TMyClass.GetValue: Integer;
begin
  Result := FValue;
end;

procedure TMyGeneric<T>.AddItem(const Item: T);
begin
  // generic add
end;

function TMyGeneric<T>.GetItem(Index: Integer): T;
begin
  Result := Default(T);
end;

class operator TMyRecord.Implicit(const A: Integer): TMyRecord;
begin
  Result.X := A;
  Result.Y := A;
end;

procedure TMyRecord.Reset;
begin
  X := 0;
  Y := 0;
end;

function TMyHelper.HelperMethod: Boolean;
begin
  Result := True;
end;

function GlobalHelper(A: Integer): string;
begin
  Result := IntToStr(A);
end;

initialization
  RegisterClass(TMyClass);

finalization
  // cleanup

end.
