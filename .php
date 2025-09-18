<?php
/* =========================================================
   Open Sesame – contact.php  (PHP 8+ / UTF-8)
   - 受信 → バリデーション → メール送信
   - 現場調査: today+21日 / 設置工事: today+21日 を min チェック
   - JSON/HTML 両対応、reCAPTCHA 任意
========================================================= */

declare(strict_types=1);

// -------------------------------------------------------
// 設定
// -------------------------------------------------------
mb_language("Japanese");
mb_internal_encoding("UTF-8");

const ADMIN_EMAIL      = 'daichi.sa0506@gmail.com';           // 送信先（管理者）
const SITE_NAME        = 'Open Sesame Demo';
const MAIL_SUBJECT     = '【お問い合わせ】%s さま（%s）'; // name, item
const FROM_EMAIL       = 'no-reply@example.com';        // Return-Path/From 用
const REPLY_TO_ENABLED = true;                          // ユーザーのアドレスを Reply-To に入れる

// reCAPTCHA（使わないなら空のままでOK）
const RECAPTCHA_SECRET = ''; // 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// 完了/エラー時の遷移（空ならこのファイル内で完了画面表示）
const REDIRECT_SUCCESS = ''; // 例: '/thanks.html'
const REDIRECT_ERROR   = ''; // 例: '/error.html'

// -------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------
function is_post(): bool {
  return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}
function wants_json(): bool {
  $h = $_SERVER['HTTP_ACCEPT'] ?? '';
  return str_contains($h, 'application/json') || strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'xmlhttprequest';
}
function trim_s(string $v): string {
  return trim(preg_replace('/\s+/u', ' ', $v));
}
function field(string $name): string {
  return isset($_POST[$name]) ? (is_string($_POST[$name]) ? trim($_POST[$name]) : '') : '';
}
function valid_email(string $email): bool {
  return (bool)filter_var($email, FILTER_VALIDATE_EMAIL);
}
function valid_tel(string $tel): bool {
  return (bool)preg_match('/^[0-9\-\+\(\) ]{9,16}$/', $tel);
}
function date_meets_min(?string $ymd, int $minDays): bool {
  if (!$ymd) return true; // 未入力はOK（任意項目のため）
  $d = DateTime::createFromFormat('Y-m-d', $ymd);
  if (!$d) return false;
  $d->setTime(0,0,0);
  $min = new DateTime('today');
  $min->modify("+{$minDays} days");
  return $d >= $min;
}
function h(string $s): string {
  return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function json_out(array $payload, int $code=200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
  exit;
}

// -------------------------------------------------------
// 受け入れ（POSTのみ）
// -------------------------------------------------------
if (!is_post()) {
  http_response_code(405);
  echo 'Method Not Allowed';
  exit;
}

// -------------------------------------------------------
// スパム軽減（ハニーポット）
// -------------------------------------------------------
$honeypot = field('hp'); // フォームに name="hp" を追加すると有効
if ($honeypot !== '') {
  // 何もせず成功風に返す（スパムに反応させない）
  if (wants_json()) json_out(['ok'=>true]);
  if (REDIRECT_SUCCESS) { header('Location: '.REDIRECT_SUCCESS); exit; }
  echo '<!doctype html><meta charset="utf-8"><p>送信ありがとうございました。</p>';
  exit;
}

// -------------------------------------------------------
// reCAPTCHA（任意）
// -------------------------------------------------------
if (RECAPTCHA_SECRET !== '' && isset($_POST['g-recaptcha-response'])) {
  $token = $_POST['g-recaptcha-response'];
  $resp = @file_get_contents('https://www.google.com/recaptcha/api/siteverify?secret=' . urlencode(RECAPTCHA_SECRET) . '&response=' . urlencode($token) . '&remoteip=' . urlencode($_SERVER['REMOTE_ADDR'] ?? ''));
  $rc = $resp ? json_decode($resp, true) : null;
  if (!$rc || empty($rc['success'])) {
    $msg = 'reCAPTCHA 検証に失敗しました。';
    if (wants_json()) json_out(['ok'=>false, 'errors'=>['recaptcha'=>$msg]], 400);
    if (REDIRECT_ERROR) { header('Location: '.REDIRECT_ERROR); exit; }
    echo '<!doctype html><meta charset="utf-8"><p>'.h($msg).'</p>';
    exit;
  }
}

// -------------------------------------------------------
// 入力取得
// -------------------------------------------------------
$item        = trim_s(field('item'));           // ラジオ
$company     = trim_s(field('company'));
$name        = trim_s(field('name'));
$email       = trim_s(field('email'));
$tel         = trim_s(field('tel'));
$model       = trim_s(field('model'));
$address     = trim_s(field('address'));
$message     = trim(field('message'));

$survey1     = field('survey_date_1') ?: null;
$survey2     = field('survey_date_2') ?: null;

$install1    = field('install_date_1') ?: null;
$install2    = field('install_date_2') ?: null;
$install3    = field('install_date_3') ?: null;

$agree       = isset($_POST['agree-terms']);   // チェックボックス

// -------------------------------------------------------
// バリデーション
// -------------------------------------------------------
$errors = [];

// 必須
if ($item === '')            $errors['item'] = 'お問い合わせ項目を選択してください。';
if ($name === '')            $errors['name'] = '氏名を入力してください。';
if ($email === '' || !valid_email($email)) $errors['email'] = '正しいメールアドレスを入力してください。';
if ($tel === '' || !valid_tel($tel))       $errors['tel'] = '正しい電話番号を入力してください。';
if ($message === '')         $errors['message'] = 'お問い合わせ内容を入力してください。';
if (!$agree)                 $errors['agree'] = '規約への同意が必要です。';

// 長さ制限（過剰入力対策）
if (mb_strlen($company) > 200)  $errors['company'] = '会社名が長すぎます。';
if (mb_strlen($address) > 400)  $errors['address'] = '住所が長すぎます。';
if (mb_strlen($message) > 4000) $errors['message'] = 'お問い合わせ内容が長すぎます。';

// 日付 min: 現場調査=+7日、設置工事=+21日（未入力はOK）
if (!date_meets_min($survey1, 21))  $errors['survey_date_1'] = '現場調査（第一希望）は本日から3週間以降をご指定ください。';
if (!date_meets_min($survey2, 21))  $errors['survey_date_2'] = '現場調査（第二希望）は本日から3週間以降をご指定ください。';

if (!date_meets_min($install1, 21)) $errors['install_date_1'] = '設置工事（第一希望）は本日から3週間以降をご指定ください。';
if (!date_meets_min($install2, 21)) $errors['install_date_2'] = '設置工事（第二希望）は本日から3週間以降をご指定ください。';
if (!date_meets_min($install3, 21)) $errors['install_date_3'] = '設置工事（第三希望）は本日から3週間以降をご指定ください。';

if (!empty($errors)) {
  if (wants_json()) json_out(['ok'=>false, 'errors'=>$errors], 422);
  if (REDIRECT_ERROR) { header('Location: '.REDIRECT_ERROR); exit; }
  // 簡易エラー表示（必要ならテンプレートに差し替え可）
  echo '<!doctype html><meta charset="utf-8"><title>送信エラー</title><body><h1>送信エラー</h1><ul>';
  foreach ($errors as $k=>$v) echo '<li>'.h($v).'</li>';
  echo '</ul><p><a href="javascript:history.back()">戻る</a></p></body>';
  exit;
}

// -------------------------------------------------------
// メール本文作成（安全な変数展開に修正）
// -------------------------------------------------------
$nl = PHP_EOL;
$mapItem = [
  'purchase'     => 'ご注文（購入）',
  'subscription' => 'ご注文（サブスク）',
  'product'      => '製品に関するご質問',
  'construction' => '設置工事に関するご質問',
  'agency'       => '販売代理店について',
  'other'        => 'その他',
];
$itemLabel = $mapItem[$item] ?? $item;

/* ここを追加：ヒアドキュメントに式を書かない（先に評価して変数へ） */
$host = $_SERVER['HTTP_HOST']       ?? '-';
$uri  = $_SERVER['REQUEST_URI']     ?? '-';
$ip   = $_SERVER['REMOTE_ADDR']     ?? '-';
$ua   = $_SERVER['HTTP_USER_AGENT'] ?? '-';
$now  = date('Y-m-d H:i:s');

$body = <<<TEXT
■ お問い合わせ項目
{$itemLabel}

■ 会社名
{$company}

■ 氏名
{$name}

■ メール
{$email}

■ 電話
{$tel}

■ モデル
{$model}

■ 設置先住所
{$address}

■ 現場調査日程
第一希望：{$survey1}
第二希望：{$survey2}

■ 設置工事希望日程
第一希望：{$install1}
第二希望：{$install2}
第三希望：{$install3}

■ お問い合わせ内容
{$message}

――――――――――――――――――――
送信元：{$host}  /  {$uri}
IP：{$ip}
UA：{$ua}
日時：{$now}
TEXT;

// -------------------------------------------------------
// メール送信
// -------------------------------------------------------
$subject = sprintf(MAIL_SUBJECT, $name, $itemLabel);

// ヘッダー作成
$fromName = mb_encode_mimeheader(SITE_NAME, 'ISO-2022-JP-MS');
$headers = [];
$headers[] = "From: {$fromName} <".FROM_EMAIL.">";
$headers[] = "MIME-Version: 1.0";
$headers[] = "Content-Type: text/plain; charset=UTF-8";
$headers[] = "Content-Transfer-Encoding: 8bit";
if (REPLY_TO_ENABLED && valid_email($email)) {
  $headers[] = "Reply-To: {$email}";
}
$headerStr = implode("\r\n", $headers);

// 実送信
$sent = mb_send_mail(ADMIN_EMAIL, $subject, $body, $headerStr, "-f ".FROM_EMAIL);

// -------------------------------------------------------
// 応答
// -------------------------------------------------------
if (wants_json()) {
  json_out(['ok' => (bool)$sent]);
}

if ($sent && REDIRECT_SUCCESS) { header('Location: '.REDIRECT_SUCCESS); exit; }
if (!$sent && REDIRECT_ERROR)  { header('Location: '.REDIRECT_ERROR);  exit; }

// 簡易サンクス
echo '<!doctype html><meta charset="utf-8"><title>送信完了</title><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;padding:2rem">';
if ($sent) {
  echo '<h1>送信ありがとうございました。</h1><p>担当者より折り返しご連絡いたします。</p>';
} else {
  echo '<h1>送信に失敗しました。</h1><p>大変お手数ですが、時間をおいて再度お試しください。</p>';
}
echo '<p><a href="/">トップへ戻る</a></p></body>';
