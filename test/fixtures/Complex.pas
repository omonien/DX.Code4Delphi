unit Complex;

interface

type
  IFoo = interface(IInterface)
    ['{12345678-1234-1234-1234-123456789ABC}']
    procedure DoIt(A: Integer);
  end;

  TFuncHolder = class(TObject)
  public
    FOnChanged: TNotifyEvent;
    FCallback: TFunc<Integer, string>;
    procedure SetCallbacks(
      const AOnChanged: TNotifyEvent;
      const ACallback: TFunc<Integer, string>);
    function Execute(Value: Integer): string;
  end;

implementation

procedure TFuncHolder.SetCallbacks(
  const AOnChanged: TNotifyEvent;
  const ACallback: TFunc<Integer, string>);
begin
  FOnChanged := AOnChanged;
  FCallback := ACallback;
end;

function TFuncHolder.Execute(Value: Integer): string;
begin
  if Assigned(FCallback) then
    Result := FCallback(Value)
  else
    Result := '';
end;

procedure LocalRoutineDemo;

  procedure NestedLocal(X: Integer);
  begin
    WriteLn(X);
  end;

begin
  NestedLocal(42);
end;

end.
