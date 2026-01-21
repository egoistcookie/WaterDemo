Page({
  data: {
    shortLink: '',
    doubaoCookie: '',
    doubaoSid: '',
    lastPlatform: '',
    parsedMediaUrl: '',
    allImages: [],  // 所有图片URL列表
    selectedImages: [],  // 选中的图片索引
    isParsing: false,
    logs: [],
    // 后端API地址，部署时需要修改为实际服务器地址
    // 本地开发使用 127.0.0.1，生产环境必须使用HTTPS
    // 方案1：使用域名（推荐）- 等域名审核通过后启用
    apiBaseUrl: 'https://www.egoistcookie.top'  // ✅ 域名：www.egoistcookie.top（等审核通过后使用）
    // 方案2：本地开发使用（暂时注释）
    //apiBaseUrl: 'http://127.0.0.1:5000'  // 本地开发测试用
    // 方案3：使用IP（需要配置HTTPS，不推荐，微信小程序可能不接受）
    //apiBaseUrl: 'https://120.77.92.36'  // 如果使用IP，需要配置自签名证书（不推荐） 
  },

  onLoad() {
    // 页面加载完成
  },

  // 输入短链
  onShortLinkInput(e) {
    this.setData({
      shortLink: e.detail.value
    })
  },

  // 输入豆包Cookie（可选，用于获取无水印原图）
  onDoubaoCookieInput(e) {
    this.setData({
      doubaoCookie: e.detail.value
    })
  },

  // 追加日志
  addLog(message, detail = '') {
    const time = new Date()
    const timeStr = [time.getHours(), time.getMinutes(), time.getSeconds()]
      .map((num) => num.toString().padStart(2, '0'))
      .join(':')
    const content = detail ? `${message} - ${detail}` : message
    this.setData({
      logs: [`[${timeStr}] ${content}`, ...this.data.logs].slice(0, 50) // 只保留最近50条
    })
  },

  // 调用后端API解析短链
  async parseShortLinkWithAPI(shortLink) {
    return new Promise((resolve, reject) => {
      this.addLog('调用后端API解析', shortLink)
      const apiUrl = `${this.data.apiBaseUrl}/api/parse`
      console.log('API请求URL:', apiUrl)
      console.log('API请求数据:', { short_link: shortLink })
      
      wx.request({
        url: apiUrl,
        method: 'POST',
        header: {
          'Content-Type': 'application/json'
        },
        data: {
          short_link: shortLink,
          cookie: (this.data.doubaoCookie || '').trim()
        },
        timeout: 30000,
        success: (res) => {
          console.log('API响应状态码:', res.statusCode)
          console.log('API响应数据:', res.data)
          
          if (res.statusCode === 200) {
            if (res.data && res.data.success) {
              console.log('API解析成功，返回数据:', res.data.data)
              this.addLog('API响应成功', JSON.stringify(res.data.data).substring(0, 100))
              resolve(res.data.data)
            } else {
              const errorMsg = res.data?.error || 'API返回success=false'
              console.error('API返回错误:', errorMsg)
              this.addLog('API返回错误', errorMsg)
              reject(new Error(errorMsg))
            }
          } else {
            const errorMsg = `HTTP ${res.statusCode}: ${res.data?.error || '请求失败'}`
            console.error('API请求失败:', errorMsg)
            this.addLog('API请求失败', errorMsg)
            reject(new Error(errorMsg))
          }
        },
        fail: (err) => {
          console.error('API请求异常:', err)
          const errorMsg = err.errMsg || '网络请求失败'
          this.addLog('API请求异常', errorMsg)
          reject(new Error(errorMsg))
        }
      })
    })
  },

  // 把Cookie换成短sid，避免把超长cookie放在图片URL里（会被截断/泄漏）
  async ensureDoubaoSid() {
    const cookie = (this.data.doubaoCookie || '').trim()
    if (!cookie) {
      this.setData({ doubaoSid: '' })
      return ''
    }
    if (this.data.doubaoSid) return this.data.doubaoSid

    const apiUrl = `${this.data.apiBaseUrl}/api/doubao_cookie`
    return new Promise((resolve) => {
      wx.request({
        url: apiUrl,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { cookie },
        timeout: 30000,
        success: (res) => {
          if (res.statusCode === 200 && res.data?.success && res.data?.data?.sid) {
            this.setData({ doubaoSid: res.data.data.sid })
            resolve(res.data.data.sid)
          } else {
            this.addLog('Cookie设置失败', res.data?.error || `HTTP ${res.statusCode}`)
            this.setData({ doubaoSid: '' })
            resolve('')
          }
        },
        fail: (err) => {
          this.addLog('Cookie设置异常', err?.errMsg || '未知错误')
          this.setData({ doubaoSid: '' })
          resolve('')
        }
      })
    })
  },

  // 构造用于展示/下载的最终图片URL（走后端图片代理，避免小程序直连第三方域名403）
  buildImageUrl(rawUrl, platform = '') {
    if (!rawUrl) return ''
    let finalImageUrl = rawUrl.trim()
    if (!finalImageUrl.startsWith('http')) {
      finalImageUrl = 'https://' + finalImageUrl
    }
    if (finalImageUrl.startsWith('http://')) {
      finalImageUrl = finalImageUrl.replace('http://', 'https://')
    }

    // 小红书：默认直接返回图片URL（不走代理，避免本地 http 后端导致预览失败）
    if ((platform || '').toLowerCase() !== 'doubao') {
      return finalImageUrl
    }

    // 豆包：根据是否有Cookie和图片类型选择方案
    const hasCookie = (this.data.doubaoCookie || '').trim().length > 0
    const isNoWatermark = !finalImageUrl.includes('~tplv-') && !finalImageUrl.includes('watermark')
    
    // 无水印候选必须走代理（带Cookie），否则403
    if (isNoWatermark && hasCookie) {
      let proxyBase = this.data.apiBaseUrl || ''
      const isLocalHttp = proxyBase.startsWith('http://127.0.0.1') || proxyBase.startsWith('http://localhost')
      if (isLocalHttp) {
        // 本地HTTP后端：无水印候选仍需要通过代理（但需要后端支持HTTPS）
        console.warn('本地HTTP后端，无水印图片需要HTTPS代理；建议使用生产HTTPS后端或填写Cookie后使用代理域名')
        // 这里仍返回原始URL，但会在加载时失败（需要用户配置HTTPS后端）
        return finalImageUrl
      }
      // 生产HTTPS：走代理带Cookie
      if (proxyBase.startsWith('http://')) {
        proxyBase = proxyBase.replace('http://', 'https://')
      }
      const sid = (this.data.doubaoSid || '').trim()
      const sidParam = sid ? `&sid=${encodeURIComponent(sid)}` : ''
      return `${proxyBase}/api/image_proxy?url=${encodeURIComponent(finalImageUrl)}${sidParam}`
    }
    
    // 水印图或没有Cookie：本地HTTP直接返回原始URL（小程序已加白名单）
    let proxyBase = this.data.apiBaseUrl || ''
    const isLocalHttp = proxyBase.startsWith('http://127.0.0.1') || proxyBase.startsWith('http://localhost')
    if (isLocalHttp) {
      return finalImageUrl
    }
    
    // 生产环境：后端应该是 HTTPS，走代理（即使水印图也走代理，更统一）
    if (proxyBase.startsWith('http://')) {
      proxyBase = proxyBase.replace('http://', 'https://')
    }
    const sid = (this.data.doubaoSid || '').trim()
    const sidParam = sid ? `&sid=${encodeURIComponent(sid)}` : ''
    return `${proxyBase}/api/image_proxy?url=${encodeURIComponent(finalImageUrl)}${sidParam}`
  },

  // 从输入文本中提取 URL
  extractUrlFromText(text) {
    if (!text) return ''
    
    // 匹配 http://xhslink.com 或 https://xhslink.com 开头的 URL
    const urlPattern = /(https?:\/\/xhslink\.com\/[^\s\u4e00-\u9fa5，。！？；：""''（）【】\n\r]+)/i
    const match = text.match(urlPattern)
    
    if (match && match[1]) {
      return match[1].trim()
    }
    
    // 如果没有匹配到，尝试匹配任何 http/https URL
    const generalUrlPattern = /(https?:\/\/[^\s\u4e00-\u9fa5，。！？；：""''（）【】\n\r]+)/i
    const generalMatch = text.match(generalUrlPattern)
    
    return generalMatch && generalMatch[1] ? generalMatch[1].trim() : ''
  },

  // 解析小红书短链获取无水印媒体
  async parseShortLink() {
    const inputText = (this.data.shortLink || '').trim()
    if (!inputText) {
      wx.showToast({
        title: '请输入短链',
        icon: 'none'
      })
      return
    }

    // 从输入文本中提取 URL
    const link = this.extractUrlFromText(inputText)
    if (!link) {
      this.addLog('提取URL失败', '未在输入中找到有效的URL')
      wx.showToast({
        title: '未找到有效的短链URL',
        icon: 'none'
      })
      return
    }
    
    this.addLog('提取到URL', link)

    this.setData({
      isParsing: true,
      parsedMediaUrl: '',
      allImages: [],
      selectedImages: []
    })
    this.addLog('开始解析短链', link)

    try {
      // 如果用户填了Cookie，先换成sid（避免图片URL里携带cookie）
      await this.ensureDoubaoSid()
      // 调用后端API解析
      const apiData = await this.parseShortLinkWithAPI(link)
      
      console.log('API返回的完整数据:', apiData)
      this.addLog('API解析成功', `找到 ${apiData.all_images?.length || 0} 张图片`)

      const platform = (apiData.platform || '').toLowerCase() || (link.includes('doubao.com') ? 'doubao' : 'xhs')
      this.setData({ lastPlatform: platform })
      
      // 豆包：优先用无水印字段（后端会同时给出 watermarked/no_watermark 供调试）
      const mediaUrl = apiData.no_watermark_image_url || apiData.image_url
      if (!mediaUrl) {
        console.error('API未返回image_url字段')
        throw new Error('API未返回图片URL')
      }
      
      console.log('原始图片URL:', mediaUrl)
      this.addLog('解析到媒体地址', mediaUrl)

      const finalImageUrl = this.buildImageUrl(mediaUrl, platform)
      console.log('处理后的图片URL:', finalImageUrl)
      this.addLog('处理后的URL', finalImageUrl)

      // 处理所有图片URL（小红书分支额外过滤掉明显异常/403较高风险的URL）
      const allImages = apiData.all_images || []
      let filteredImages = allImages
      if (platform !== 'doubao') {
        // 小红书：过滤异常URL
        filteredImages = allImages.filter((url) => {
          const u = (url || '').trim()
          if (!u || !u.startsWith('http')) return false
          // 去掉带 CSS background 样式的拼接串
          if (u.indexOf(');background') !== -1) return false
          // 去掉纯域名根路径
          if (u === 'https://sns-webpic-qc.xhscdn.com' || u === 'https://sns-webpic-qc.xhscdn.com/') return false
          // 小红书很多图片URL没有 .jpg/.png 后缀，常以 !nd_... 结尾（例如 !nd_dft_wlteh_webp_3）
          const isXhsCdn = /xhscdn\.com/i.test(u) || /xiaohongshu\.com/i.test(u)
          if (!isXhsCdn) return false
          // 允许：带常见图片后缀 或 含 !nd_ 这类处理后缀 或 包含 notes_pre_post 路径
          const hasExt = /\.(jpe?g|png|webp|gif)([?#].*|$)/i.test(u)
          const hasNdSuffix = /!nd_[a-z0-9_]+/i.test(u)
          const hasNotesPath = /\/notes_pre_post\//i.test(u)
          return hasExt || hasNdSuffix || hasNotesPath
        })
      } else {
        // 豆包：如果用户没有填Cookie，只显示水印图（避免无水印候选403）
        // 无水印候选（去掉 ~tplv-... 的URL）通常需要Cookie才能访问
        const hasCookie = (this.data.doubaoCookie || '').trim().length > 0
        if (!hasCookie) {
          filteredImages = allImages.filter((url) => {
            const u = (url || '').trim()
            if (!u || !u.startsWith('http')) return false
            // 只保留水印图（带 ~tplv-...watermark... 的URL），过滤掉无水印候选
            return '~tplv-' in u || 'watermark' in u
          })
          console.log(`豆包：未提供Cookie，仅显示水印图（过滤掉${allImages.length - filteredImages.length}张无水印候选）`)
          this.addLog('提示', '未提供Cookie，仅显示可访问的水印图；如需无水印原图，请填写Cookie')
        } else {
          // 有Cookie：显示所有图片（无水印候选会通过代理请求，后端会带上Cookie）
          console.log('豆包：已提供Cookie，显示所有图片（无水印候选通过代理请求）')
        }
      }

      const processedImages = filteredImages.map((url, index) => {
        const raw = (url || '').trim()
        const displayUrl = this.buildImageUrl(raw, platform)
        return {
          url: displayUrl,        // 用于展示/下载的实际URL（豆包走代理，小红书直连）
          rawUrl: raw,            // 保留原始URL以便调试
          selected: false,        // 选中状态
          index: index
        }
      })

      // 设置所有图片URL
      this.setData({
        parsedMediaUrl: finalImageUrl,  // 保留第一个作为主要显示
        allImages: processedImages,
        selectedImages: []  // 重置选中状态
      })

      wx.showToast({
        title: `解析成功，找到${processedImages.length}张图片`,
        icon: 'success',
        duration: 2000
      })
    } catch (error) {
      const msg = error?.message || '解析失败'
      this.addLog('解析失败', msg)
      console.error('解析错误:', error)
      wx.showToast({
        title: msg.length > 20 ? msg.substring(0, 20) + '...' : msg,
        icon: 'none',
        duration: 3000
      })
    } finally {
      this.setData({
        isParsing: false
      })
    }
  },

  // 切换图片选中状态
  toggleImageSelect(e) {
    const index = e.currentTarget.dataset.index
    const { allImages, selectedImages } = this.data
    
    // 切换选中状态
    const image = allImages[index]
    image.selected = !image.selected
    
    // 更新selectedImages数组
    if (image.selected) {
      if (selectedImages.indexOf(index) === -1) {
        selectedImages.push(index)
      }
    } else {
      const idx = selectedImages.indexOf(index)
      if (idx > -1) {
        selectedImages.splice(idx, 1)
      }
    }
    
    this.setData({
      allImages: allImages,
      selectedImages: selectedImages
    })
    
    console.log('选中状态:', selectedImages)
  },

  // 全选/取消全选
  toggleSelectAll() {
    const { allImages, selectedImages } = this.data
    const isAllSelected = selectedImages.length === allImages.length
    
    // 更新所有图片的选中状态
    allImages.forEach((image, index) => {
      image.selected = !isAllSelected
    })
    
    // 更新selectedImages数组
    const newSelectedImages = isAllSelected ? [] : allImages.map((_, index) => index)
    
    this.setData({
      allImages: allImages,
      selectedImages: newSelectedImages
    })
  },

  // 下载选中的图片
  downloadSelectedImages() {
    const { allImages, selectedImages } = this.data
    
    if (selectedImages.length === 0) {
      wx.showToast({
        title: '请先选择要下载的图片',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: `下载中(0/${selectedImages.length})...`
    })

    const imagesToDownload = selectedImages.map(index => {
      const image = allImages[index]
      return image?.url || image
    })
    let successCount = 0
    let failCount = 0
    let currentIndex = 0

    // 递归下载图片
    const downloadNext = () => {
      if (currentIndex >= imagesToDownload.length) {
        wx.hideLoading()
        const message = `下载完成：成功${successCount}张，失败${failCount}张`
        this.addLog('批量下载完成', message)
        wx.showToast({
          title: message,
          icon: successCount > 0 ? 'success' : 'none',
          duration: 3000
        })
        // 清空选中状态
        this.setData({
          selectedImages: []
        })
        return
      }

      const imageUrl = imagesToDownload[currentIndex]
      currentIndex++
      
      wx.showLoading({
        title: `下载中(${currentIndex}/${selectedImages.length})...`
      })

      this.addLog(`下载第${currentIndex}张`, imageUrl)

      wx.downloadFile({
        url: imageUrl,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                successCount++
                this.addLog(`第${currentIndex}张保存成功`, '')
                downloadNext()
              },
              fail: (err) => {
                failCount++
                console.error(`保存第${currentIndex}张失败:`, err)
                this.addLog(`第${currentIndex}张保存失败`, err.errMsg || '未知错误')
                downloadNext()
              }
            })
          } else {
            failCount++
            this.addLog(`第${currentIndex}张下载失败`, `状态码：${res.statusCode}`)
            downloadNext()
          }
        },
        fail: (err) => {
          failCount++
          console.error(`下载第${currentIndex}张异常:`, err)
          this.addLog(`第${currentIndex}张下载异常`, err.errMsg || '未知错误')
          downloadNext()
        }
      })
    }

    downloadNext()
  },

  // 下载单张图片（兼容旧代码）
  downloadImage(e) {
    const index = e?.currentTarget?.dataset?.index
    const { allImages, parsedMediaUrl } = this.data
    
    let imageUrl
    if (index !== undefined) {
      // 从列表下载
      const image = allImages[index]
      imageUrl = image?.url || image
    } else {
      // 下载第一张（兼容）
      imageUrl = parsedMediaUrl
    }

    if (!imageUrl) {
      wx.showToast({
        title: '没有可下载的图片',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '下载中...'
    })

    this.addLog('开始下载图片', imageUrl)

    wx.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading()
              this.addLog('图片已保存到相册', '')
              wx.showToast({
                title: '保存成功',
                icon: 'success'
              })
            },
            fail: (err) => {
              wx.hideLoading()
              if (err.errMsg.includes('auth deny')) {
                wx.showModal({
                  title: '提示',
                  content: '需要授权访问相册才能保存图片',
                  showCancel: false
                })
              } else {
                this.addLog('保存失败', err.errMsg || '未知错误')
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                })
              }
            }
          })
        } else {
          wx.hideLoading()
          this.addLog('下载失败', `状态码：${res.statusCode}`)
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        this.addLog('下载异常', err?.errMsg || '未知错误')
        wx.showToast({
          title: '下载失败',
          icon: 'none',
          duration: 3000
        })
      }
    })
  }
})
