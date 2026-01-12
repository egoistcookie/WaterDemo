Page({
  data: {
    originalImage: '',
    processedImage: '',
    brushSize: 20,
    ctx: null,
    canvasWidth: 0,
    canvasHeight: 0,
    imageWidth: 0,
    imageHeight: 0,
    isDrawing: false,
    lastX: 0,
    lastY: 0
  },

  onLoad() {
    // 获取系统信息，设置canvas尺寸
    const systemInfo = wx.getSystemInfoSync()
    const windowWidth = systemInfo.windowWidth
    
    // canvas显示尺寸（与CSS尺寸一致）
    const canvasWidth = windowWidth - 40
    const canvasHeight = windowWidth * 1.5  // 增加高度确保能显示完整图片
    
    this.setData({
      canvasWidth: canvasWidth,
      canvasHeight: canvasHeight
    })
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.setData({
          originalImage: tempFilePath,
          processedImage: ''
        })
        this.loadImageToCanvas(tempFilePath)
      },
      fail: (err) => {
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 加载图片到canvas
  loadImageToCanvas(imagePath) {
    const { canvasWidth, canvasHeight } = this.data
    const ctx = wx.createCanvasContext('imageCanvas', this)
    
    // 获取图片信息
    wx.getImageInfo({
      src: imagePath,
      success: (res) => {
        const { width, height } = res
        
        // 计算图片在canvas中的显示尺寸（保持宽高比，完整显示）
        // 让图片填满canvas的宽度，高度按比例缩放
        const scale = canvasWidth / width
        const drawWidth = canvasWidth
        const drawHeight = height * scale
        
        // 如果高度超过canvas，则按高度缩放
        let finalWidth = drawWidth
        let finalHeight = drawHeight
        let offsetX = 0
        let offsetY = 0
        
        if (drawHeight > canvasHeight) {
          const scaleH = canvasHeight / height
          finalWidth = width * scaleH
          finalHeight = canvasHeight
          offsetX = (canvasWidth - finalWidth) / 2
        } else {
          offsetY = (canvasHeight - finalHeight) / 2
        }
        
        // 保存图片显示信息（包括原始尺寸）
        this.setData({
          imageWidth: finalWidth,
          imageHeight: finalHeight,
          imageOffsetX: offsetX,
          imageOffsetY: offsetY,
          imageOriginalWidth: width,
          imageOriginalHeight: height,
          imageScale: finalWidth / width
        })
        
        // 清空canvas并绘制图片
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)
        ctx.drawImage(imagePath, offsetX, offsetY, finalWidth, finalHeight)
        ctx.draw(false, () => {
          this.setData({ ctx })
        })
      },
      fail: (err) => {
        wx.showToast({
          title: '加载图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 触摸开始
  onTouchStart(e) {
    const { ctx, imageWidth, imageHeight, imageOffsetX, imageOffsetY } = this.data
    if (!ctx) return
    
    const touch = e.touches[0]
    const x = touch.x
    const y = touch.y
    
    // 转换为相对于图片的坐标
    const imageX = x - imageOffsetX
    const imageY = y - imageOffsetY
    
    // 检查是否在图片范围内
    if (imageX < 0 || imageX > imageWidth || imageY < 0 || imageY > imageHeight) {
      return
    }
    
    // 重置上一个点，确保第一次绘制从当前位置开始
    this.setData({
      isDrawing: true,
      lastX: x,
      lastY: y
    })
    
    this.eraseWatermark(x, y)
  },

  // 触摸移动
  onTouchMove(e) {
    const { isDrawing } = this.data
    if (!isDrawing) return
    
    const touch = e.touches[0]
    const x = touch.x
    const y = touch.y
    
    this.eraseWatermark(x, y)
    
    this.setData({
      lastX: x,
      lastY: y
    })
  },

  // 触摸结束
  onTouchEnd() {
    this.setData({
      isDrawing: false,
      lastX: 0,
      lastY: 0
    })
    this.exportCanvas()
  },

  // 涂抹去除水印
  eraseWatermark(x, y) {
    const { ctx, brushSize, lastX, lastY } = this.data
    if (!ctx) return
    
    // 使用全局合成模式进行涂抹
    ctx.globalCompositeOperation = 'destination-out'
    
    // 绘制连续路径，从上一个点到当前点
    if (lastX !== x || lastY !== y) {
      ctx.beginPath()
      ctx.moveTo(lastX, lastY)
      ctx.lineTo(x, y)
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    
    // 在当前位置绘制圆形，确保覆盖
    ctx.beginPath()
    ctx.arc(x, y, brushSize / 2, 0, 2 * Math.PI)
    ctx.fill()
    
    ctx.draw(true)
  },

  // 画笔大小变化
  onBrushSizeChange(e) {
    this.setData({
      brushSize: e.detail.value
    })
  },

  // 自动去除水印
  autoRemoveWatermark() {
    wx.showLoading({
      title: '处理中...'
    })
    
    const { originalImage } = this.data
    
    // 使用canvas进行简单的自动处理
    this.processImageAuto(originalImage, () => {
      wx.hideLoading()
      this.exportCanvas()
    })
  },

  // 自动处理图片（简化算法）
  processImageAuto(imagePath, callback) {
    const { canvasWidth, canvasHeight, imageWidth, imageHeight, imageOffsetX, imageOffsetY } = this.data
    const ctx = wx.createCanvasContext('imageCanvas', this)
    
    wx.getImageInfo({
      src: imagePath,
      success: (res) => {
        // 清空canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)
        
        // 绘制原图
        ctx.drawImage(imagePath, imageOffsetX, imageOffsetY, imageWidth, imageHeight)
        
        // 简单的自动处理：轻微透明度叠加
        ctx.globalAlpha = 0.95
        ctx.drawImage(imagePath, imageOffsetX, imageOffsetY, imageWidth, imageHeight)
        
        ctx.draw(false, () => {
          if (callback) callback()
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '处理失败',
          icon: 'none'
        })
      }
    })
  },

  // 导出canvas为图片
  exportCanvas() {
    const { imageWidth, imageHeight, imageOffsetX, imageOffsetY, imageOriginalWidth, imageOriginalHeight } = this.data
    
    // 导出完整图片区域，使用原始尺寸确保清晰度
    wx.canvasToTempFilePath({
      canvasId: 'imageCanvas',
      x: imageOffsetX,
      y: imageOffsetY,
      width: imageWidth,
      height: imageHeight,
      destWidth: imageOriginalWidth,  // 使用原始图片尺寸，确保清晰
      destHeight: imageOriginalHeight,
      success: (res) => {
        this.setData({
          processedImage: res.tempFilePath
        })
      },
      fail: (err) => {
        console.error('导出失败', err)
        wx.showToast({
          title: '导出失败: ' + (err.errMsg || '未知错误'),
          icon: 'none',
          duration: 2000
        })
      }
    }, this)
  },

  // 重置图片
  resetImage() {
    const { originalImage } = this.data
    if (originalImage) {
      this.loadImageToCanvas(originalImage)
      this.setData({
        processedImage: ''
      })
    }
  },

  // 保存图片
  saveImage() {
    const { processedImage } = this.data
    if (!processedImage) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }
    
    wx.saveImageToPhotosAlbum({
      filePath: processedImage,
      success: () => {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
      },
      fail: (err) => {
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '提示',
            content: '需要授权访问相册',
            showCancel: false
          })
        } else {
          wx.showToast({
            title: '保存失败',
            icon: 'none'
          })
        }
      }
    })
  }
})
