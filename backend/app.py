"""
小红书短链解析后端服务
使用Flask提供API接口，解析小红书短链并返回无水印原图URL
"""
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import requests
import re
import json
import logging
import base64
import html as _html
from urllib.parse import unquote, unquote_plus
from urllib.parse import urlparse, urljoin
import time
import os
import uuid

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 简易会话：用短 token 保存豆包 Cookie（避免把超长Cookie放在URL里被截断/泄漏）
COOKIE_SESSIONS = {}  # sid -> {"cookie": str, "ts": float}
COOKIE_SESSION_TTL_SECONDS = 60 * 30  # 30分钟


def _cleanup_cookie_sessions():
    now = time.time()
    expired = [sid for sid, v in COOKIE_SESSIONS.items() if now - v.get("ts", 0) > COOKIE_SESSION_TTL_SECONDS]
    for sid in expired:
        COOKIE_SESSIONS.pop(sid, None)


@app.route('/api/doubao_cookie', methods=['POST'])
def doubao_cookie():
    """把豆包Cookie保存到后端，返回短 sid，供 image_proxy 使用（避免cookie放URL里）"""
    try:
        _cleanup_cookie_sessions()
        data = request.get_json() or {}
        cookie = (data.get('cookie') or '').strip()
        if not cookie:
            return jsonify({'success': False, 'error': 'cookie 不能为空'}), 400

        sid = uuid.uuid4().hex
        COOKIE_SESSIONS[sid] = {"cookie": cookie, "ts": time.time()}
        return jsonify({'success': True, 'data': {'sid': sid, 'ttl_seconds': COOKIE_SESSION_TTL_SECONDS}})
    except Exception as e:
        logger.error("doubao_cookie失败: %s", str(e), exc_info=True)
        return jsonify({'success': False, 'error': 'doubao_cookie失败: {}'.format(str(e))}), 500

# 请求头配置，模拟浏览器（默认按小红书配置）
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.xiaohongshu.com/',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}

# 豆包专用请求头（避免 Referer/Host 看起来像小红书）
DOUBAO_HEADERS = {
    'User-Agent': HEADERS['User-Agent'],
    'Accept': HEADERS['Accept'],
    'Accept-Language': HEADERS['Accept-Language'],
    'Accept-Encoding': HEADERS['Accept-Encoding'],
    'Connection': HEADERS['Connection'],
    'Upgrade-Insecure-Requests': HEADERS['Upgrade-Insecure-Requests'],
    'Referer': 'https://www.doubao.com/',
    'Host': 'www.doubao.com',
}


def extract_url_from_text(text):
    """从输入文本中提取URL"""
    if not text:
        return ''
    
    # 匹配 http://xhslink.com 或 https://xhslink.com 开头的 URL
    url_pattern = r'(https?://xhslink\.com/[^\s\u4e00-\u9fa5，。！？；：""''（）【】\n\r]+)'
    match = re.search(url_pattern, text, re.IGNORECASE)
    
    if match:
        return match.group(1).strip()
    
    # 如果没有匹配到，尝试匹配任何 http/https URL
    general_pattern = r'(https?://[^\s\u4e00-\u9fa5，。！？；：""''（）【】\n\r]+)'
    general_match = re.search(general_pattern, text, re.IGNORECASE)
    
    return general_match.group(1).strip() if general_match else ''


def resolve_short_link(short_link):
    """解析短链，获取真实跳转地址"""
    try:
        logger.info(f"开始解析短链: {short_link}")
        
        # 发送请求，跟随重定向，减少超时时间
        response = requests.get(
            short_link,
            headers=HEADERS,
            allow_redirects=True,
            timeout=5  # 减少超时时间从10秒到5秒
        )
        
        final_url = response.url
        logger.info(f"短链跳转完成: {final_url}")
        
        return final_url
    except Exception as e:
        logger.error(f"解析短链失败: {str(e)}")
        raise


def extract_note_id_from_url(url):
    """从URL中提取笔记ID"""
    patterns = [
        r'/explore/([a-f0-9]+)',
        r'/discovery/item/([a-f0-9]+)',
        r'/user/profile/([a-f0-9]+)/notes/([a-f0-9]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1) if len(match.groups()) == 1 else match.group(2)
    
    return None


# 注释掉API调用函数，因为API基本都失败，直接使用HTML提取更快
# def fetch_note_api(note_id):
#     """调用小红书笔记API获取笔记详情（已禁用，直接使用HTML提取）"""
#     pass


def extract_images_from_html(html):
    """从HTML中提取图片URL"""
    if not html:
        return []
    
    images = []
    
    # 1. 尝试提取 __INITIAL_STATE__ 中的图片（改进版）
    try:
        # 尝试多种匹配模式
        state_patterns = [
            r'__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*</script>',
            r'window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*</script>',
            r'__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});',
        ]
        
        json_text = None
        for pattern in state_patterns:
            state_match = re.search(pattern, html, re.IGNORECASE)
            if state_match:
                json_text = state_match.group(1)
                logger.info(f"找到__INITIAL_STATE__，长度: {len(json_text)}")
                break
        
        if json_text:
            # 清理JSON文本
            json_text = json_text.replace('\\u002F', '/')
            json_text = json_text.replace('\\/', '/')
            
            # 尝试解析JSON（可能需要处理不完整的JSON）
            try:
                state_obj = json.loads(json_text)
                
                # 查找图片列表（尝试多种路径）
                note_data = state_obj.get('note', {}).get('note', {})
                if not note_data:
                    note_data = state_obj.get('note', {})
                
                image_list = note_data.get('imageList', [])
                if not image_list:
                    image_list = note_data.get('images', [])
                
                for img in image_list:
                    url = img.get('url') or img.get('originalUrl') or img.get('originUrl') or img.get('info', {}).get('url', '')
                    if url and url.startswith('http'):
                        images.append(url)
                
                if images:
                    logger.info(f"从__INITIAL_STATE__提取到 {len(images)} 张图片")
                    return images
            except json.JSONDecodeError as e:
                logger.warning(f"JSON解析失败，尝试部分提取: {str(e)}")
                # JSON解析失败，尝试直接从文本中提取图片URL
                # 继续执行下面的正则匹配
    except Exception as e:
        logger.warning(f"解析__INITIAL_STATE__失败: {str(e)}")
    
    # 2. 尝试正则匹配常见的图片URL模式（优化：优先匹配最可能成功的模式）
    # 优先匹配小红书CDN图片URL（最常见）
    patterns = [
        # 优先：直接匹配小红书CDN图片URL（最快最准确）
        r'https?://sns-webpic-[^"\'<>\s]+',
        r'https?://sns-img-[^"\'<>\s]+',
        # JSON格式的图片URL（需要捕获组）
        r'"url":"(https?://sns-[^"]+)"',
        r'"originalUrl":"(https?://[^"]+)"',
        r'"originUrl":"(https?://[^"]+)"',
        r'"imageList":\s*\[\s*{\s*"url":"(https?://[^"]+)"',
        # 其他图片URL模式
        r'https?://ci\.xiaohongshu\.com/[^"\'<>\s]+',
        r'https?://qimg\.xiaohongshu\.com/[^"\'<>\s]+',
        r'https?://img\.xiaohongshu\.com/[^"\'<>\s]+',
        r'"url":"(https?://[^"]+)"\s*,\s*"width"',
        # Meta标签
        r'property="og:image"\s+content="(https?://[^"]+)"',
        r'name="og:image"\s+content="(https?://[^"]+)"',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        if matches:
            # 如果pattern有捕获组，matches是元组列表，否则是字符串列表
            if matches and isinstance(matches[0], tuple):
                matches = [m[0] if m[0] else m for m in matches]
            
            # 过滤掉非图片URL
            valid_matches = [m for m in matches if ('sns-' in m or 'xiaohongshu.com' in m or 'xhscdn.com' in m) and m.startswith('http')]
            if valid_matches:
                images.extend(valid_matches)
                logger.info(f"通过正则匹配提取到 {len(valid_matches)} 个URL")
                break  # 找到就立即返回，不再尝试其他模式
    
    # 去重并过滤
    images = list(set(images))
    images = [img for img in images if img.startswith('http') and ('sns-img' in img or 'xiaohongshu.com' in img or 'xhscdn.com' in img)]
    
    if images:
        logger.info(f"总共提取到 {len(images)} 张图片")
    
    return images


def _extract_urls_from_json(obj, domains):
    """递归从JSON对象中提取指定域名的图片URL"""
    urls = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                if v.startswith('http') and any(d in v for d in domains):
                    urls.append(v)
            else:
                urls.extend(_extract_urls_from_json(v, domains))
    elif isinstance(obj, list):
        for item in obj:
            urls.extend(_extract_urls_from_json(item, domains))
    return urls


def _try_parse_json_loose(text):
    """尽可能从脚本文本中解析JSON（支持URL编码/转义/base64等常见形式）"""
    if not text:
        return None

    candidates = [text.strip()]

    # 去掉可能包裹的引号
    if (candidates[0].startswith('"') and candidates[0].endswith('"')) or (
        candidates[0].startswith("'") and candidates[0].endswith("'")
    ):
        candidates.append(candidates[0][1:-1])

    # URL 编码/加号空格
    candidates.append(unquote(candidates[0]))
    candidates.append(unquote_plus(candidates[0]))

    # 反斜杠转义（常见于内嵌字符串）
    candidates.append(candidates[0].encode('utf-8', errors='ignore').decode('unicode_escape', errors='ignore'))

    # base64（如果看起来像 base64）
    base = re.sub(r'\s+', '', candidates[0])
    if re.fullmatch(r'[A-Za-z0-9+/=]+', base or '') and len(base) > 100:
        try:
            decoded = base64.b64decode(base + '===')  # 容错 padding
            candidates.append(decoded.decode('utf-8', errors='ignore'))
        except Exception:
            pass

    seen = set()
    for c in candidates:
        if not c or c in seen:
            continue
        seen.add(c)
        try:
            return json.loads(c)
        except Exception:
            continue
    return None


def extract_doubao_images_from_html(html):
    """从豆包thread页面HTML中提取图片URL（尽量获取无水印原图）"""
    if not html:
        return []

    images = []

    # 先把HTML实体解码（非常关键：豆包页面里常见 &amp; 会破坏签名参数）
    try:
        html = _html.unescape(html)
    except Exception:
        pass

    # 1. 先尝试从页面中的 JSON 状态脚本中提取（类似小红书 __INITIAL_STATE__）
    try:
        script_patterns = [
            r'<script[^>]+id="__RENDER_DATA__"[^>]*>([\s\S]*?)</script>',
            r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>',
        ]
        json_text = None
        for pattern in script_patterns:
            m = re.search(pattern, html, re.IGNORECASE)
            if m:
                json_text = m.group(1).strip()
                logger.info(f"豆包页面找到JSON脚本，长度: {len(json_text)}")
                break

        domains = ['byteimg.com', 'byteadapters.cn', 'doubaoimg.com']

        if json_text:
            state_obj = _try_parse_json_loose(json_text)
            if state_obj is None:
                logger.warning("豆包JSON解析失败（多种解码方式均失败），将使用正则继续提取")
            else:
                images.extend(_extract_urls_from_json(state_obj, domains))
    except Exception as e:
        logger.warning(f"豆包JSON脚本解析异常: {str(e)}")

    # 2. 直接从HTML文本中用正则匹配图片URL（兜底）
    patterns = [
        r'https?://[^\s"\'<>]*byteimg\.com[^\s"\'<>]*',
        r'https?://[^\s"\'<>]*byteadapters\.cn[^\s"\'<>]*',
        r'https?://[^\s"\'<>]*doubaoimg\.com[^\s"\'<>]*',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        if matches:
            logger.info(f"豆包页面通过正则匹配到 {len(matches)} 个候选URL")
            images.extend(matches)

    # 3. 去重、清洗（保留查询参数，避免破坏签名；仅做最小处理）
    cleaned = []
    for u in images:
        if not u.startswith('http'):
            continue

        # 豆包经常返回带处理后缀的“水印/缩略图”URL，例如：
        # ...jpeg~tplv-xxx-downsize_watermark_...png?x-signature=...
        # 尝试生成“无水印候选”：去掉 "~tplv-..." 到 "?" 之前的部分，同时保留 query 参数（签名）。
        q = ''
        base = u
        if '?' in u:
            base, q = u.split('?', 1)
            q = '?' + q

        # 去掉处理后缀（从 ~tplv- 开始到结尾）
        if '~tplv-' in base:
            base_no_tplv = base.split('~tplv-', 1)[0]
            cleaned.append(base_no_tplv + q)  # 优先加入“疑似无水印原图”

        cleaned.append(u)  # 同时保留原始URL兜底

    # 去重，但尽量保持顺序（先保留无水印候选）
    seen = set()
    ordered = []
    for u in cleaned:
        if u in seen:
            continue
        seen.add(u)
        ordered.append(u)

    cleaned = ordered

    if cleaned:
        logger.info(f"豆包页面最终提取到 {len(cleaned)} 张图片")

    return cleaned


def pick_best_doubao_image_url(urls):
    """
    选择最合适的豆包图片URL：优先不含 watermark 的候选；如果候选不可访问，则回退到可访问的URL。
    注意：部分“无水印候选”可能需要登录态（Cookie）才能访问。
    """
    if not urls:
        return None, None

    def is_watermarked(u):
        return 'watermark' in (u or '') or '~tplv-' in (u or '')

    no_wm = None
    wm = None
    for u in urls:
        if not u:
            continue
        if no_wm is None and not is_watermarked(u):
            no_wm = u
        if wm is None and is_watermarked(u):
            wm = u
        if no_wm and wm:
            break

    # 兜底：如果没找到明显分类，就取第一个
    if no_wm is None:
        no_wm = urls[0]
    if wm is None:
        wm = urls[0]

    return no_wm, wm


def fetch_page_with_playwright(url):
    """使用Playwright获取完整渲染后的页面（如果需要）"""
    try:
        from playwright.sync_api import sync_playwright
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until='networkidle', timeout=30000)
            
            # 等待页面加载
            time.sleep(2)
            
            html = page.content()
            browser.close()
            
            return html
    except ImportError:
        logger.warning("Playwright未安装，跳过浏览器渲染")
        return None


def fetch_doubao_image_urls_with_playwright(url, cookie=None):
    """
    使用Playwright抓取页面加载过程中的图片请求URL。
    用途：很多“无水印原图”并不直接出现在HTML里，而是在网络请求里以另一条签名URL出现。
    """
    try:
        from playwright.sync_api import sync_playwright

        collected = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            if cookie:
                # cookie 字符串透传时，我们不做结构化拆分；只在请求头层面更可靠
                context.set_extra_http_headers({"Cookie": cookie})

            page = context.new_page()

            def on_request(req):
                try:
                    u = req.url
                    if 'byteimg.com' in u or 'byteadapters.cn' in u or 'doubaoimg.com' in u:
                        collected.append(u)
                except Exception:
                    pass

            page.on("request", on_request)
            page.goto(url, wait_until='networkidle', timeout=30000)
            time.sleep(2)
            browser.close()

        # 去重并保序
        seen = set()
        ordered = []
        for u in collected:
            if u in seen:
                continue
            seen.add(u)
            ordered.append(u)
        return ordered
    except ImportError:
        logger.warning("Playwright未安装，跳过网络抓取")
        return []
    except Exception as e:
        logger.error(f"Playwright网络抓取失败: {str(e)}")
        return []


def _is_url_accessible(url, headers, timeout=12):
    """用最小代价探测URL是否可访问（206/200均算可用）"""
    try:
        h = dict(headers or {})
        # Range 可以显著减少带宽，并且很多CDN支持
        h['Range'] = 'bytes=0-0'
        resp = requests.get(url, headers=h, timeout=timeout, stream=True)
        return resp.status_code in (200, 206)
    except Exception:
        return False
    except Exception as e:
        logger.error(f"Playwright获取页面失败: {str(e)}")
        return None


@app.route('/api/parse', methods=['POST'])
def parse_short_link():
    """解析短链/链接API（支持小红书、豆包等）"""
    try:
        data = request.get_json()
        short_link = data.get('short_link', '').strip()
        
        if not short_link:
            return jsonify({
                'success': False,
                'error': '短链不能为空'
            }), 400
        
        # 从文本中提取URL
        url = extract_url_from_text(short_link)
        if not url:
            return jsonify({
                'success': False,
                'error': '未找到有效的短链URL'
            }), 400
        
        logger.info(f"提取到URL: {url}")

        # 如果是豆包链接，走豆包解析逻辑（无需解析成小红书笔记）
        if 'doubao.com' in url:
            try:
                logger.info(f"开始解析豆包链接: {url}")
                doubao_headers = dict(DOUBAO_HEADERS)
                # 可选：允许前端透传 Cookie（部分豆包页面可能需要登录态）
                cookie = (data.get('cookie') or '').strip() if isinstance(data, dict) else ''
                if cookie:
                    doubao_headers['Cookie'] = cookie

                resp = requests.get(url, headers=doubao_headers, timeout=8)
                html = resp.text
                logger.info(f"豆包页面HTML长度: {len(html)}")

                images = extract_doubao_images_from_html(html)

                # 兜底：如果静态HTML里没有图片，尝试用 Playwright 渲染后再提取
                if not images:
                    logger.info("豆包静态HTML未提取到图片，尝试Playwright渲染兜底")
                    rendered_html = fetch_page_with_playwright(url)
                    if rendered_html:
                        images = extract_doubao_images_from_html(rendered_html)

                # 进一步兜底：通过Playwright抓取网络请求中的图片URL（常见于“无水印原图”隐藏在请求中）
                pw_urls = fetch_doubao_image_urls_with_playwright(url, cookie=cookie if cookie else None)
                if pw_urls:
                    images = list(pw_urls) + list(images or [])

                if not images:
                    return jsonify({
                        'success': False,
                        'error': '未在豆包页面中找到图片，可能是页面结构变化/图片为动态加载/需要登录（可在请求体中传 cookie 字段）'
                    }), 404

                no_wm_url, wm_url = pick_best_doubao_image_url(images)

                # 尝试“可访问性选择”：优先选择可访问的无水印URL；否则回退到可访问的水印URL
                image_url = None
                if no_wm_url and _is_url_accessible(no_wm_url, headers={'User-Agent': HEADERS['User-Agent'], 'Referer': 'https://www.doubao.com/'}):
                    image_url = no_wm_url
                elif wm_url and _is_url_accessible(wm_url, headers={'User-Agent': HEADERS['User-Agent'], 'Referer': 'https://www.doubao.com/'}):
                    image_url = wm_url
                else:
                    image_url = no_wm_url or wm_url or images[0]

                logger.info(f"豆包解析成功，图片URL: {image_url}")

                return jsonify({
                    'success': True,
                    'data': {
                        'image_url': image_url,
                        'all_images': images,
                        'no_watermark_image_url': no_wm_url,
                        'watermarked_image_url': wm_url,
                        'note_id': None,
                        'target_url': url,
                        'platform': 'doubao'
                    }
                })
            except Exception as e:
                logger.error(f"解析豆包链接失败: {str(e)}", exc_info=True)
                return jsonify({
                    'success': False,
                    'error': f'解析豆包链接失败: {str(e)}'
                }), 500
        
        # 解析短链获取真实地址（小红书）
        target_url = resolve_short_link(url)
        
        # 提取笔记ID
        note_id = extract_note_id_from_url(target_url)
        logger.info(f"提取到笔记ID: {note_id}")
        
        images = []
        
        # 直接使用HTML提取（API基本都失败，跳过以提升速度）
        try:
            logger.info(f"从HTML提取图片，URL: {target_url}")
            response = requests.get(target_url, headers=HEADERS, timeout=8)  # 减少超时时间
            html = response.text
            logger.info(f"获取到HTML，长度: {len(html)}")
            
            images = extract_images_from_html(html)
            
        except Exception as e:
            logger.error(f"获取页面失败: {str(e)}", exc_info=True)
        
        if not images:
            return jsonify({
                'success': False,
                'error': '未找到图片，可能是笔记不存在或需要登录'
            }), 404
        
        # 返回第一张图片的URL（无水印原图）
        image_url = images[0]
        
        logger.info(f"解析成功，图片URL: {image_url}")
        
        return jsonify({
            'success': True,
            'data': {
                'image_url': image_url,
                'all_images': images,
                'note_id': note_id,
                'target_url': target_url
            }
        })
        
    except Exception as e:
        logger.error(f"解析失败: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'解析失败: {str(e)}'
        }), 500


@app.route('/api/image_proxy', methods=['GET'])
def image_proxy():
    """
    简单的图片代理接口：后端代为请求目标图片URL并将二进制内容转发给小程序。
    用途：解决小程序直接请求第三方图片域名出现403/域名不在白名单的问题。
    使用方式：<image src=\"http://你的后端/api/image_proxy?url=ENCODED_URL\" />
    """
    _cleanup_cookie_sessions()
    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'success': False, 'error': 'url 参数不能为空'}), 400

    try:
        # 前端 encodeURIComponent + HTML实体可能导致签名参数被破坏，这里做一次实体反解码
        url = _html.unescape(url).strip()
        sid = request.args.get('sid', '').strip()
        cookie = ''
        if sid and sid in COOKIE_SESSIONS:
            cookie = (COOKIE_SESSIONS.get(sid, {}).get('cookie') or '').strip()
            COOKIE_SESSIONS[sid]['ts'] = time.time()  # 续期
        else:
            # 兼容旧用法（不推荐）：cookie 放URL里可能被截断
            cookie = request.args.get('cookie', '').strip()
            cookie = _html.unescape(cookie).strip()

        # 根据来源做简单的Header伪装
        headers = {
            'User-Agent': HEADERS['User-Agent'],
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': 'https://www.doubao.com/' if 'byteimg.com' in url or 'doubao' in url else HEADERS.get('Referer', ''),
        }
        if cookie:
            headers['Cookie'] = cookie
        resp = requests.get(url, headers=headers, timeout=15, stream=True)
        content_type = resp.headers.get('Content-Type', 'image/jpeg')
        status = resp.status_code

        if status != 200:
            logger.warning("图片代理请求失败，status=%s, url=%s", status, url)
            return jsonify({'success': False, 'error': '图片请求失败，状态码 {}'.format(status)}), status

        return Response(resp.content, mimetype=content_type)
    except Exception as e:
        logger.error("图片代理异常: %s", str(e), exc_info=True)
        return jsonify({'success': False, 'error': '图片代理异常: {}'.format(str(e))}), 500


@app.route('/health', methods=['GET'])
def health():
    """健康检查接口"""
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    # 小程序 <image> 需要 https；开发环境可用自签证书快速启动：设置环境变量 FLASK_HTTPS=1
    use_https = os.environ.get('FLASK_HTTPS', '').strip() == '1'
    if use_https:
        # 优先使用用户提供的证书（适用于Windows/生产环境）
        cert_file = os.environ.get('FLASK_SSL_CERT', '').strip()
        key_file = os.environ.get('FLASK_SSL_KEY', '').strip()
        if cert_file and key_file:
            app.run(host='0.0.0.0', port=5000, debug=True, ssl_context=(cert_file, key_file))
        else:
            # werkzeug 的 adhoc 需要 cryptography；某些 Python 版本/环境可能无法安装该依赖
            try:
                app.run(host='0.0.0.0', port=5000, debug=True, ssl_context='adhoc')
            except Exception as e:
                logger.error("HTTPS启动失败，请提供证书：设置 FLASK_SSL_CERT/FLASK_SSL_KEY。错误: %s", str(e))
                raise
    else:
        app.run(host='0.0.0.0', port=5000, debug=True)
