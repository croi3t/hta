// ==============================================================================
// ポリファーマシー対策 高齢者注意薬剤リスト (POLYPHARMACY_DATA)
// 
// 【準拠・参考基準】
// ・日本老年医学会「高齢者の安全な薬物療法ガイドライン」
// ・厚生労働省「高齢者の医薬品適正使用の指針（総論編・各論編）」
// ・PST-Japan（ポリファーマシー病態別スクリーニングツール）
//
// 【データ形式】
// 各カテゴリ内に「一般名 (generic)」と「代表的商品名 (brand)」の2列で保持しています。
// 「ポリファーマシー管理.html」の画面から誰でも簡単に追加・編集・保存できます。
// ==============================================================================

var POLYPHARMACY_DATA = [
  {
    category: "ベンゾジアゼピン系・睡眠薬・抗不安薬",
    risk: "転倒・骨折・せん妄・認知機能低下・過鎮静",
    items: [
      { generic: "エチゾラム", brand: "デパス" },
      { generic: "トリアゾラム", brand: "ハルシオン" },
      { generic: "ゾルピデム", brand: "マイスリー" },
      { generic: "エスゾピクロン", brand: "ルネスタ" },
      { generic: "ゾピクロン", brand: "アモバン" },
      { generic: "ブロチゾラム", brand: "レンドルミン" },
      { generic: "フルニトラゼパム", brand: "サイレース, ロヒプノール" },
      { generic: "ニトラゼパム", brand: "ベンザリン, ネルボン" },
      { generic: "エスタゾラム", brand: "ユーロジン" },
      { generic: "リルマザホン", brand: "リスミー" },
      { generic: "ロルメタゼパム", brand: "ロラメット, エバミール" },
      { generic: "フルラゼパム", brand: "ダルメート" },
      { generic: "クアゼパム", brand: "ドラール" },
      { generic: "ハロキサゾラム", brand: "ソメリン" },
      { generic: "アルプラゾラム", brand: "ソラナックス, コンスタン" },
      { generic: "ロラゼパム", brand: "ワイパックス" },
      { generic: "クロチアゼパム", brand: "リーゼ" },
      { generic: "ジアゼパム", brand: "セルシン, ホリゾン" },
      { generic: "クロナゼパム", brand: "リボトリール, ランドセン" },
      { generic: "クロルジアゼポキシド", brand: "バランス, コントール" },
      { generic: "オキサゾラム", brand: "セレナール" },
      { generic: "ロフラゼプ酸エチル", brand: "メイラックス" },
      { generic: "プラゼパム", brand: "セドレスト" },
      { generic: "タンドスピロン", brand: "セディール" },
      { generic: "クロバザム", brand: "マイスタン" }
    ]
  },
  {
    category: "抗コリン薬・第1世代抗ヒスタミン薬",
    risk: "せん妄・認知機能低下・便秘・口渇・排尿障害・緑内障悪化",
    items: [
      { generic: "トリヘキシフェニジル", brand: "アーテン" },
      { generic: "ビペリデン", brand: "アキネトン" },
      { generic: "プロフェナミン", brand: "パーキン" },
      { generic: "ピロヘプチン", brand: "トリモール" },
      { generic: "メチキセン", brand: "トレミン" },
      { generic: "ヒドロキシジン", brand: "アタラックス, アタラックスP" },
      { generic: "ジフェンヒドラミン", brand: "レスタミン, トラベルミン, ドリエル" },
      { generic: "クロルフェニラミン", brand: "ポララミン" },
      { generic: "プロメタジン", brand: "ピレチア, ヒベルナ" },
      { generic: "シプロヘプタジン", brand: "ペリアクチン" },
      { generic: "クレマスチン", brand: "タベジール" },
      { generic: "ホモクロルシクリジン", brand: "ホモクロミン" },
      { generic: "ベタメタゾン・d-クロルフェニラミン", brand: "セレスタミン" },
      { generic: "プロピベリン", brand: "バップフォー" },
      { generic: "オキシブチニン", brand: "ポラキス, ネオキシテープ" },
      { generic: "ソリフェナシン", brand: "ベシケア" },
      { generic: "トルテロジン", brand: "デトルシトール" },
      { generic: "イミダフェナシン", brand: "ウリトス, ステーブラ" },
      { generic: "フェソテロジン", brand: "トビエース" },
      { generic: "フラボキサート", brand: "ブラダロン" },
      { generic: "ブチルスコポラミン", brand: "ブスコパン" },
      { generic: "チキジウム", brand: "チアトン" },
      { generic: "ピナベリウム", brand: "ジセテル" },
      { generic: "オチロニウム", brand: "スパスモペビリン" }
    ]
  },
  {
    category: "NSAIDs (非ステロイド性抗炎症薬)",
    risk: "消化性潰瘍・消化管出血・急性腎障害・心不全増悪・血圧上昇",
    items: [
      { generic: "ロキソプロフェン", brand: "ロキソニン" },
      { generic: "ジクロフェナク", brand: "ボルタレン" },
      { generic: "セレコキシブ", brand: "セレコックス" },
      { generic: "メロキシカム", brand: "モービック" },
      { generic: "インドメタシン", brand: "インダシン" },
      { generic: "イブプロフェン", brand: "ブルフェン" },
      { generic: "ナプロキセン", brand: "ナイキサン" },
      { generic: "プラノプロフェン", brand: "ニフレック" },
      { generic: "エトドラク", brand: "ハイペン, オステラック" },
      { generic: "ピロキシカム", brand: "フェルデン, バキソ" },
      { generic: "アンピロキシカム", brand: "フルカム" },
      { generic: "スルリンダク", brand: "クリノリル" },
      { generic: "ナブメトン", brand: "レラフェン" },
      { generic: "フルルビプロフェン", brand: "フロベン" },
      { generic: "ケトプロフェン", brand: "メナドール" },
      { generic: "チアプロフェン酸", brand: "スルガム" },
      { generic: "ロルノキシカム", brand: "ロルカム" },
      { generic: "モフェゾラク", brand: "ジサネート" },
      { generic: "アセメタシン", brand: "ランツジール" }
    ]
  },
  {
    category: "SU薬・グリニド系 (血糖降下薬)",
    risk: "遷延性・重症低血糖・意識障害・転倒",
    items: [
      { generic: "グリメピリド", brand: "アマリール" },
      { generic: "グリクラジド", brand: "グリミクロン" },
      { generic: "グリベンクラミド", brand: "オイグルコン, ダオニール" },
      { generic: "ナテグリニド", brand: "ファスティック, スターシス" },
      { generic: "ミチグリニド", brand: "グルファスト" },
      { generic: "レパグリニド", brand: "シュアポスト" }
    ]
  },
  {
    category: "ループ利尿薬・浸透圧利尿薬",
    risk: "脱水・電解質異常(低K/低Na)・起立性低血圧・急性腎障害",
    items: [
      { generic: "フロセミド", brand: "ラシックス" },
      { generic: "アゾセミド", brand: "ダイアート" },
      { generic: "トラセミド", brand: "ルプラック" },
      { generic: "ブメタニド", brand: "ルネトロン" },
      { generic: "トルバプタン", brand: "サムスカ" }
    ]
  },
  {
    category: "胃酸抑制薬 (PPI・H2ブロッカー長期連用)",
    risk: "肺炎(誤嚥性肺炎)・CD腸炎・骨折・低Mg血症・ビタミンB12低下",
    items: [
      { generic: "オメプラゾール", brand: "オメプラール, オメプラゾン" },
      { generic: "ランソプラゾール", brand: "タケプロン" },
      { generic: "エソメプラゾール", brand: "ネキシウム" },
      { generic: "ラベプラゾール", brand: "パリエット" },
      { generic: "ボノプラザン", brand: "タケキャブ" },
      { generic: "ファモチジン", brand: "ガスター" },
      { generic: "ラニチジン", brand: "ザンタック" },
      { generic: "シメチジン", brand: "タガメット" },
      { generic: "ロキサチジン", brand: "アルタット" },
      { generic: "ニザチジン", brand: "アシノン" },
      { generic: "ラフチジン", brand: "プロテカジン, ストガー" }
    ]
  },
  {
    category: "抗精神病薬",
    risk: "錐体外路症状・過鎮静・転倒・嚥下障害・心血管イベント",
    items: [
      { generic: "クエチアピン", brand: "セロクエル" },
      { generic: "リスペリドン", brand: "リスパダール" },
      { generic: "オランザピン", brand: "ジプレキサ" },
      { generic: "ハロペリドール", brand: "セレネース" },
      { generic: "アリピプラゾール", brand: "エビリファイ" },
      { generic: "ペロスピロン", brand: "ルーラン" },
      { generic: "チアプリド", brand: "グラマリール" },
      { generic: "スルピリド", brand: "ドグマチール, アビリット" },
      { generic: "クロルプロマジン", brand: "コントミン, ウインタミン" },
      { generic: "レボメプロマジン", brand: "ヒルナミン, レボトミン" },
      { generic: "プロクロルペラジン", brand: "ノバミン" },
      { generic: "ブロナンセリン", brand: "ロナセン" },
      { generic: "アセナピン", brand: "シクレスト" },
      { generic: "ブレクスピプラゾール", brand: "レキサルティ" },
      { generic: "パリペリドン", brand: "インヴェガ" },
      { generic: "クロザピン", brand: "クロザリル" }
    ]
  },
  {
    category: "三環系抗うつ薬",
    risk: "強抗コリン作用・せん妄・起立性低血圧・不整脈",
    items: [
      { generic: "アミトリプチリン", brand: "トリプタノール" },
      { generic: "イミプラミン", brand: "トフラニール" },
      { generic: "クロミプラミン", brand: "アナフラニール" },
      { generic: "ノルトリプチリン", brand: "ノリトレン" },
      { generic: "アモキサピン", brand: "アモキサン" },
      { generic: "ドスレピン", brand: "プロチアデン" },
      { generic: "トリミプラミン", brand: "スルモンチール" }
    ]
  },
  {
    category: "強心配糖体・抗不整脈薬",
    risk: "有効域狭小・ジギタリス中毒・徐脈・催不整脈・相互作用",
    items: [
      { generic: "ジゴキシン", brand: "ジゴシン" },
      { generic: "ジギトキシン", brand: "ジギトキシン" },
      { generic: "メチルジゴキシン", brand: "ラニラピッド" },
      { generic: "ジソピラミド", brand: "リスモダン" },
      { generic: "プロカインアミド", brand: "アミサリン" },
      { generic: "アミオダロン", brand: "アンカロン" }
    ]
  },
  {
    category: "α1遮断薬 (降圧薬・排尿障害改善薬)",
    risk: "起立性低血圧・めまい・ふらつき・転倒",
    items: [
      { generic: "ドキサゾシン", brand: "カルデナリン" },
      { generic: "プラゾシン", brand: "ミニプレス" },
      { generic: "テラゾシン", brand: "ハイトラシン, バソメット" },
      { generic: "タムスロシン", brand: "ハルナール" },
      { generic: "シロドシン", brand: "ユリーフ" },
      { generic: "ウラピジル", brand: "エブランチル" }
    ]
  },
  {
    category: "刺激性緩下薬 (長期連用)",
    risk: "耐性・大腸運動低下(メラノーシス)・電解質異常",
    items: [
      { generic: "センノシド", brand: "プルゼニド" },
      { generic: "ピコスルファートナトリウム", brand: "ラキソベロン" },
      { generic: "ダイオウ (大黄)", brand: "大黄甘草湯, 麻子仁丸等" },
      { generic: "センナ", brand: "アローゼン等" }
    ]
  }
];
