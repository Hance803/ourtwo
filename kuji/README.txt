Ourtwo「一番賞」美術素材 v2

共17張正式PNG，含選做箱底與標題圖。
畫風：沿用v1日系手帳、奶油紙色、珊瑚粉／鼠尾草綠、深咖啡手繪線。

【v2檔案】
kuji_small.png：120×160，透明背景，箱內小籤；30張全部使用同一張。
kuji_box.png：600×600，透明圓角，空白箱底；未畫入任何籤。
kuji_flap.png：600×400，透明角，籤的外面；字樣「一番賞」。
kuji_strip.png：120×400，透明角，獨立封條；左緣虛線撕口，朝下箭頭。
kuji_A.png、kuji_B.png、kuji_C.png、kuji_D.png、kuji_E.png、kuji_last.png：各600×400。
badge_A.png、badge_B.png、badge_C.png、badge_D.png、badge_E.png、badge_last.png：各128×128，透明背景。
kuji_header.png：600×240，透明背景。

【工程對位】
1. 內頁與kuji_flap使用同一個600×400畫布、同一紙張Alpha輪廓，左上角皆對齊(0,0)。
2. kuji_strip左上角疊在(480,0)，原始尺寸120×400，不留額外水平間隙。
   手機籤顯示300×200時，封條尺寸60×200、位置(240,0)。
3. 封條的虛線位於封條自身左緣；沿線撕下後，封條向下飛離並旋轉。
4. 封條移除後，以籤面上緣為旋轉軸往上翻；CSS transform-origin:50% 0%。
   不需要沿用v1整張封面往右拖走的行為。kuji_flap沒有虛線或撕向箭頭。
5. 籤號留白區（kuji_flap）：x160～405、y285～330；建議中心(282,307)。
   畫面300×200時對應x80～202.5、y142.5～165，中心(141,153.5)。
   No.01～No.30由程式寫，正式素材未含任何號碼。
6. 六張內頁的獎品文字區仍為x40～560、y230～370，完全留白、淺色。
   文字色#3B2A24，最多2行；正式素材未寫入獎品名稱。
7. 箱底中央可擺籤範圍建議x28～572、y28～572。
   600×600示意：小籤縮為75×100，左上角(40+89×欄,40+105×列)，欄0～5、列0～4。
   可隨機旋轉約±2°。箱子顯示350×350時，每張小籤約44×58像素。
8. 內頁與徽章及標題圖沿用v1原檔；金／紫／綠／粉橘／奶油／深藍金各有辨識。

【附檔】
_preview/Ourtwo_Kuji_v2_Overview.png：17張素材總覽，箱內30張僅為擺放示意。
_preview/Ourtwo_Kuji_v2_Box_30.png：30張小籤擺放示意，程式應使用空白kuji_box.png和獨立kuji_small.png。
_preview/Ourtwo_Kuji_v2_Mobile_QA.png：實際手機尺寸、深淺底、封條前後檢視。
預覽的No.01是示意用程式文字，未畫入正式素材。
_docs/prompts_v2.txt：四張新增／修改素材的內建image_gen提示詞。
_docs/prompts_v1_reused.txt：沿用素材的原生成提示詞。
_docs/manifest.json：尺寸、定位、文字留白區、檔案雜湊。

此v2素材包不含已停用的kuji_cover.png。
