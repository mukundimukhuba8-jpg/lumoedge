//+------------------------------------------------------------------+
//| LumoEdgeCopy.mq5 - VPS copy trade receiver for Lumo Edge         |
//+------------------------------------------------------------------+
#property copyright "Lumo Edge"
#property link      "https://lumoedge.vercel.app"
#property version   "1.00"
#property strict

input string CopyEaId    = "";                              // Copy EA ID (from Lumo Edge Setup)
input string LicenseKey  = "";                              // LUMO license key
input string ApiBaseUrl  = "https://lumoedge.vercel.app";   // Lumo Edge API URL
input int    PollSeconds = 3;                               // Poll interval (seconds)
input int    Slippage    = 30;                              // Slippage (points)
input ulong  MagicNumber = 880031;                          // Magic number

string g_lastOrderId = "";

int OnInit()
  {
   EventSetTimer(MathMax(1, PollSeconds));
   Print("Lumo Edge Copy EA started. Copy EA ID: ", CopyEaId);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   if(StringLen(CopyEaId) < 4 || StringLen(LicenseKey) < 8)
      return;
   PollAndExecute();
  }

string BuildPollUrl()
  {
   string base = ApiBaseUrl;
   if(StringLen(base) > 0 && StringGetCharacter(base, StringLen(base)-1) == '/')
      base = StringSubstr(base, 0, StringLen(base)-1);
   return base + "/api/copy/poll?format=text&copyEaId=" + CopyEaId + "&licenseKey=" + LicenseKey;
  }

bool HttpGet(const string url, string &body, string &err)
  {
   char data[];
   char result[];
   string headers = "";
   ResetLastError();
   int code = WebRequest("GET", url, headers, 5000, data, result, headers);
   if(code == -1)
     {
      err = "WebRequest failed. Add " + ApiBaseUrl + " to Tools > Options > Expert Advisors > Allow WebRequest.";
      return false;
     }
   body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   return true;
  }

bool HttpPostJson(const string path, const string json, string &err)
  {
   string base = ApiBaseUrl;
   if(StringLen(base) > 0 && StringGetCharacter(base, StringLen(base)-1) == '/')
      base = StringSubstr(base, 0, StringLen(base)-1);
   string url = base + path;
   char data[];
   StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   char result[];
   string headers = "Content-Type: application/json\r\n";
   ResetLastError();
   int code = WebRequest("POST", url, headers, 5000, data, result, headers);
   if(code == -1)
     {
      err = "Ack WebRequest failed";
      return false;
     }
   return true;
  }

string LineAt(const string text, const int index)
  {
   string lines[];
   int n = StringSplit(text, '\n', lines);
   if(index < 0 || index >= n) return "";
   string line = lines[index];
   StringReplace(line, "\r", "");
   return line;
  }

bool ParseOrder(const string body, string &orderId, string &symbol, string &side, double &volume, double &sl, double &tp, string &comment, int &trades)
  {
   if(LineAt(body, 0) != "OK") return false;
   if(LineAt(body, 1) != "ORDER") return false;
   orderId = LineAt(body, 2);
   symbol  = LineAt(body, 3);
   side    = LineAt(body, 4);
   volume  = StringToDouble(LineAt(body, 5));
   sl      = StringToDouble(LineAt(body, 6));
   tp      = StringToDouble(LineAt(body, 7));
   comment = LineAt(body, 8);
   trades  = (int)StringToInteger(LineAt(body, 9));
   if(volume <= 0) volume = 0.01;
   if(trades <= 0) trades = 1;
   return(StringLen(orderId) > 0 && StringLen(symbol) > 0);
  }

bool PlaceTrade(const string symbol, const string side, const double volume, const double sl, const double tp, const string comment)
  {
   MqlTradeRequest req;
   MqlTradeResult  res;
   ZeroMemory(req);
   ZeroMemory(res);
   req.action       = TRADE_ACTION_DEAL;
   req.symbol       = symbol;
   req.volume       = volume;
   req.deviation    = Slippage;
   req.magic        = MagicNumber;
   req.type         = (side == "sell") ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
   req.type_filling = ORDER_FILLING_IOC;
   req.comment      = comment;
   if(sl > 0) req.sl = sl;
   if(tp > 0) req.tp = tp;
   if(!OrderSend(req, res))
     {
      Print("OrderSend failed: ", GetLastError(), " retcode=", res.retcode);
      return false;
     }
   return true;
  }

void AckOrder(const string orderId)
  {
   string json = "{\"copyEaId\":\"" + CopyEaId + "\",\"licenseKey\":\"" + LicenseKey + "\",\"orderId\":\"" + orderId + "\"}";
   string err = "";
   HttpPostJson("/api/copy/ack", json, err);
  }

void PollAndExecute()
  {
   string body = "";
   string err = "";
   if(!HttpGet(BuildPollUrl(), body, err))
     {
      Print(err);
      return;
     }
   if(LineAt(body, 0) == "ERR")
     {
      Print("Poll error: ", LineAt(body, 1));
      return;
     }
   if(LineAt(body, 1) == "NONE")
      return;

   string orderId, symbol, side, comment;
   double volume, sl, tp;
   int trades;
   if(!ParseOrder(body, orderId, symbol, side, volume, sl, tp, comment, trades))
      return;
   if(orderId == g_lastOrderId)
      return;

   int placed = 0;
   for(int i = 0; i < trades; i++)
     {
      if(PlaceTrade(symbol, side, volume, sl, tp, comment))
         placed++;
      Sleep(250);
     }

   if(placed > 0)
     {
      g_lastOrderId = orderId;
      AckOrder(orderId);
      Print("Lumo Edge copied ", placed, " ", side, " ", symbol, " (", orderId, ")");
     }
  }

//+------------------------------------------------------------------+
