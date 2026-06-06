import { PapersService } from './papers.service';

describe('PapersService arXiv XML parser', () => {
  let service: PapersService;

  beforeEach(() => {
    service = new PapersService({} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('parses arXiv XML entries into frontend-friendly papers', () => {
    const xml = `
      <feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
        <opensearch:totalResults>1</opensearch:totalResults>
        <entry>
          <id>http://arxiv.org/abs/2307.09288v2</id>
          <updated>2023-07-20T17:59:26Z</updated>
          <published>2023-07-18T17:59:08Z</published>
          <title>Llama 2: Open Foundation and Fine-Tuned Chat Models</title>
          <summary>In this work, we develop and release Llama 2.</summary>
          <author><name>Hugo Touvron</name></author>
          <author><name>Louis Martin</name></author>
          <link href="http://arxiv.org/abs/2307.09288v2" rel="alternate" type="text/html"/>
          <link href="http://arxiv.org/pdf/2307.09288v2" rel="related" title="pdf" type="application/pdf"/>
          <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
          <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
          <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
        </entry>
      </feed>
    `;

    expect(service.parseArxivXml(xml)).toEqual({
      total: 1,
      data: [
        {
          id: '2307.09288v2',
          arxiv_id: '2307.09288',
          title: 'Llama 2: Open Foundation and Fine-Tuned Chat Models',
          summary: 'In this work, we develop and release Llama 2.',
          authors: ['Hugo Touvron', 'Louis Martin'],
          pdfLink: 'http://arxiv.org/pdf/2307.09288v2',
          abstractLink: 'http://arxiv.org/abs/2307.09288v2',
          publishedDate: '2023-07-18T17:59:08Z',
          updatedDate: '2023-07-20T17:59:26Z',
          primaryCategory: 'cs.CL',
          allCategories: ['cs.CL', 'cs.AI', 'cs.LG'],
        },
      ],
    });
  });
});
