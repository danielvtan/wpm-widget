import * as vscode from 'vscode';
import { SerialPort } from "serialport";


let statusBarItem: vscode.StatusBarItem;
let serialPort: SerialPort | undefined;
export function activate({ subscriptions, extensionUri }: vscode.ExtensionContext) {

  let inputTimestamps: number[] = [];
  let wpm: number = 0;
  let bestWpm: number = 0;
  let timeout: NodeJS.Timeout | undefined;
  let statusBarVisible = true;
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBarItem.text = `WPM: 0 wpm | BEST: 0`;
  statusBarItem.show();


  function disableSerial() {
    serialPort?.close();
    serialPort = undefined;
  }
  function enableSerial() {
    if (serialPort) return;

    SerialPort.list().then((portOptions) => {

      portOptions.forEach(portOption => {
        console.log(portOption);
        if (!portOption.manufacturer?.startsWith("Silicon Labs")) { return; }

        serialPort = new SerialPort({
          path: portOption.path,
          baudRate: 115200,
        });
        serialPort.flush();
        serialPort.drain();
        serialPort.on('readable', function() {
          console.log('Data:', serialPort?.read())
        })

      });

    }).catch(e => console.log(e));
  }
  enableSerial();

  const onTextChanged = vscode.workspace.onDidChangeTextDocument((event) => {
    if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
      let input = event.contentChanges[0].text;

      console.log(input);
      if (input === "" || input === " " || input === "\n") { return; }

      inputTimestamps.push(Date.now());

      if (inputTimestamps.length >= 5) {
        let oldest = inputTimestamps[0];
        let newest = inputTimestamps[inputTimestamps.length - 1];
        let minute = (newest - oldest) / 1000 / 60;
        let words = inputTimestamps.length / 5;
        wpm = Math.floor(words / minute);

        statusBarItem.text = `WPM: ${wpm} wpm | BEST: ${bestWpm}`;
      }
      if (inputTimestamps.length >= 50) {
        inputTimestamps.shift();
      }
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        inputTimestamps = [];
        if (wpm > bestWpm) { bestWpm = wpm; }

        saveWpm = wpm;
        statusBarItem.text = `WPM: ${wpm} | BEST: ${bestWpm}`;
      }, 2000); // reset after 2 second pause
    }
  });


  setInterval(() => {
    sendWpm({ w: wpm, s: saveWpm, b: bestWpm });
  }, 500);

  const toggleStatusBarCommand = vscode.commands.registerCommand('words-per-minute-widget.toggleStatusBar', () => {
    statusBarVisible = !statusBarVisible;
    if (statusBarVisible) {
      statusBarItem.show();
      inputTimestamps = [];
      enableSerial();
    } else {
      statusBarItem.hide();
    }
  });

  const disableCommand = vscode.commands.registerCommand('words-per-minute-widget.disable', () => {
    inputTimestamps = [];
    statusBarItem.hide();
    disableSerial();
  });

  const resetStatsCommand = vscode.commands.registerCommand('words-per-minute-widget.resetWpmStats', () => {
    serialPort?.write(`Rreset^`);
  });
  subscriptions.push(onTextChanged,
    toggleStatusBarCommand,
    resetStatsCommand,
    disableCommand
  );
}

let lastWpm: number;
let lastBestWpm: number;
let saveWpm: any;

type WpmParams =
  { w: number, s: any, b: number };
function sendWpm({ w, s, b }: WpmParams) {
  if (w !== 0 && w !== lastWpm) {
    lastWpm = w;
    serialPort?.write(`W${w}^`);
  }
  if (b !== 0 && b !== lastBestWpm) {
    lastBestWpm = b;
    serialPort?.write(`B${b}^`);
  }
  if (s !== undefined) {
    console.log(s);
    serialPort?.write(`S${s}^`);
    saveWpm = undefined;
  }
}
