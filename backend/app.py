"""
小红书短链解析后端服务
使用Flask提供API接口，解析小红书短链并返回无水印原图URL
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import re
import json
import logging
from urllib.parse import urlparse, urljoin
import time

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 请求头配置，模拟浏览器
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.xiaohongshu.com/',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
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
    except Exception as e:
        logger.error(f"Playwright获取页面失败: {str(e)}")
        return None


@app.route('/api/parse', methods=['POST'])
def parse_short_link():
    """解析小红书短链API"""
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
        
        # 解析短链获取真实地址
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


@app.route('/health', methods=['GET'])
def health():
    """健康检查接口"""
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
