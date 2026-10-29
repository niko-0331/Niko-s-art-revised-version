# 静かな教室

診断パートと複数ルートのシナリオを含む、ブラウザー向けのホラーノベルゲームです。

## フォルダー構成

```text
.
├── index.html
├── script.js
├── style.css
└── assets/
	├── images/  キャラクター画像
	└── audio/   音声素材
```

## 起動

`index.html` をブラウザーで開いてください。3DパートではThree.jsをCDNから読み込むため、3D表示にはインターネット接続が必要です。読み込みに失敗した場合は3Dパートをスキップして物語を続けます。

## 素材

- キャラクター画像は `assets/images/shione.png`、`assets/images/hinata.png`、`assets/images/koharu.png` として配置できます。画像がない場合はゲーム内のシルエット表示に切り替わります。
- WAVファイルは `assets/audio/` に保管しています。現在の効果音とBGMはWeb Audio APIで生成しており、これらのWAVファイルはゲームからまだ再生していません。
- 音声合成によるボイスはブラウザーの日本語音声に依存します。利用できる音声がない環境では再生されません。