// get-arxiv-tags.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function buildArxivTags() {
  try {
    console.log('🔄 Đang kết nối tới arXiv.org để quét toàn bộ danh mục...');
    const response = await axios.get('https://arxiv.org/category_taxonomy');
    const htmlContent = response.data;
    
    // Regex quét chính xác cặp mã ngành và tên ngành trong HTML của arXiv
    const tagRegex = /([a-z\-]+\.[A-Z\-]+|[a-z\-]+)\s+\(([^)]+)\)/g;
    const tagsMap = {};
    let match;
    let count = 0;

    while ((match = tagRegex.exec(htmlContent)) !== null) {
      const code = match[1];
      const name = match[2];
      
      if (code.includes('example') || name.length > 80) continue;

      let groupCode = code.includes('.') ? code.split('.')[0] : 'physics';
      
      // Gộp các mã vật lý cũ về chung nhóm physics
      if (['astro-ph', 'cond-mat', 'hep-th', 'hep-ph', 'hep-ex', 'hep-lat', 'nucl-th', 'nucl-ex', 'gr-qc', 'quant-ph'].includes(code)) {
        groupCode = 'physics';
      }

      const groupNames = {
        'cs': 'Computer Science & AI',
        'math': 'Mathematics',
        'q-bio': 'Quantitative Biology',
        'q-fin': 'Quantitative Finance',
        'stat': 'Statistics',
        'eess': 'Electrical Engineering',
        'econ': 'Economics',
        'physics': 'Physics & Quantum'
      };

      if (!tagsMap[groupCode]) {
        tagsMap[groupCode] = {
          groupName: groupNames[groupCode] || groupCode.toUpperCase(),
          tags: []
        };
      }

      if (!tagsMap[groupCode].tags.some(t => t.id === code)) {
        tagsMap[groupCode].tags.push({
          id: code,
          slug: code.toLowerCase().replace('.', '-'), // Tạo slug dạng cs-ai giống daily.dev
          name: name,
        });
        count++;
      }
    }

    // Đảm bảo thư mục đích tồn tại
    const dirPath = path.join(__dirname, 'src', 'arxiv', 'data');
    if (!fs.existsSync(dirPath)){
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(dirPath, 'arxiv-categories.json'), 
      JSON.stringify(tagsMap, null, 2), 
      'utf-8'
    );

    console.log(`✅ Thành công! Đã quét được ${count} tags và lưu vào dự án NestJS.`);
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }
}

buildArxivTags();


--------------------------------------------------

// src/arxiv/interfaces/category.interface.ts
export interface ArxivTag {
  id: string;     // ví dụ: "cs.AI"
  slug: string;   // ví dụ: "cs-ai"
  name: string;   // ví dụ: "Artificial Intelligence"
}

export interface ArxivGroup {
  groupName: string;
  tags: ArxivTag[];
}

export interface ArxivCategoriesMap {
  [groupCode: string]: ArxivGroup;
}


===============================
// src/arxiv/arxiv.module.ts
import { Module } from '@nestjs/common';
import { ArxivController } from './arxiv.controller';
import { ArxivService } from './arxiv.service';
import * as fs from 'fs';
import * as path from 'path';

@Module({
  controllers: [ArxivController],
  providers: [
    ArxivService,
    {
      provide: 'ARXIV_DATA_PROVIDER',
      useFactory: () => {
        // Đọc file JSON đồng bộ ngay khi khởi động ứng dụng
        const filePath = path.join(__dirname, 'data', 'arxiv-categories.json');
        const fallbackPath = path.join(process.cwd(), 'src', 'arxiv', 'data', 'arxiv-categories.json');
        const finalPath = fs.existsSync(filePath) ? filePath : fallbackPath;
        
        const rawData = fs.readFileSync(finalPath, 'utf-8');
        return JSON.parse(rawData);
      },
    },
  ],
  exports: [ArxivService], // Export nếu các module khác (như bài viết) cần dùng chung
})
export class ArxivModule {}

===============
// src/arxiv/arxiv.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { ArxivCategoriesMap, ArxivTag } from './interfaces/category.interface';

@Injectable()
export class ArxivService {
  constructor(
    @Inject('ARXIV_DATA_PROVIDER') 
    private readonly categoriesData: ArxivCategoriesMap,
  ) {}

  // 1. Trả về cấu trúc cây phân nhóm (Dùng để vẽ Sidebar đa tầng giống daily.dev)
  getCategoriesTree(): ArxivCategoriesMap {
    return this.categoriesData;
  }

  // 2. Trả về mảng phẳng (Flat array) (Dùng cho thanh tìm kiếm tag hoặc gợi ý)
  getFlatCategories() {
    const flatList: Array<ArxivTag & { group: string }> = [];
    
    for (const groupInfo of Object.values(this.categoriesData)) {
      for (const tag of groupInfo.tags) {
        flatList.push({
          id: tag.id,
          slug: tag.slug,
          name: tag.name,
          group: groupInfo.groupName,
        });
      }
    }
    return flatList;
  }

  // 3. Hàm tiện ích: Kiểm tra xem một Category Id client gửi lên có hợp lệ không
  isValidCategory(tagId: string): boolean {
    const flatList = this.getFlatCategories();
    return flatList.some(tag => tag.id === tagId);
  }
}

==========================// src/arxiv/arxiv.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ArxivService } from './arxiv.service';

@Controller('api/arxiv')
export class ArxivController {
  constructor(private readonly arxivService: ArxivService) {}

  @Get('categories')
  getCategories(@Query('format') format: string) {
    // Nếu client gọi: /api/arxiv/categories?format=flat
    if (format === 'flat') {
      return this.arxivService.getFlatCategories();
    }
    
    // Mặc định trả về cấu trúc cây nhóm ngành
    return this.arxivService.getCategoriesTree();
  }
}

Sample Computer Science
cs.AI (Artificial Intelligence)
Covers all areas of AI except Vision, Robotics, Machine Learning, Multiagent Systems, and Computation and Language (Natural Language Processing), which have separate subject areas. In particular, includes Expert Systems, Theorem Proving (although this may overlap with Logic in Computer Science), Knowledge Representation, Planning, and Uncertainty in AI. Roughly includes material in ACM Subject Classes I.2.0, I.2.1, I.2.3, I.2.4, I.2.8, and I.2.11.

cs.AR (Hardware Architecture)
Covers systems organization and hardware architecture. Roughly includes material in ACM Subject Classes C.0, C.1, and C.5.

cs.CC (Computational Complexity)
Covers models of computation, complexity classes, structural complexity, complexity tradeoffs, upper and lower bounds. Roughly includes material in ACM Subject Classes F.1 (computation by abstract devices), F.2.3 (tradeoffs among complexity measures), and F.4.3 (formal languages), although some material in formal languages may be more appropriate for Logic in Computer Science. Some material in F.2.1 and F.2.2, may also be appropriate here, but is more likely to have Data Structures and Algorithms as the primary subject area.

cs.CE (Computational Engineering, Finance, and Science)
Covers applications of computer science to the mathematical modeling of complex systems i
